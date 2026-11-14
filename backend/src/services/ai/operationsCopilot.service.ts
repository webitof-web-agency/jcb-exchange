type ReviewPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type KycDocumentSignal = {
  type: string;
  status: string;
  expiryDate: Date | string | null;
  hasFile: boolean;
  hasDocumentNumber: boolean;
};

export type KycReview = {
  readinessScore: number;
  priority: ReviewPriority;
  blockers: Array<{ code: string; message: string }>;
  recommendations: string[];
};

const asDate = (value: Date | string | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const buildKycReview = (documents: KycDocumentSignal[], requiredTypes: string[], now = new Date()): KycReview => {
  const blockers: KycReview['blockers'] = [];
  const byType = new Map(documents.map((document) => [document.type, document]));
  for (const type of requiredTypes) {
    const document = byType.get(type);
    if (!document || !document.hasFile || ['NOT_UPLOADED', 'REJECTED'].includes(document.status)) {
      blockers.push({ code: 'MISSING_DOCUMENT', message: `${type.replace(/_/gu, ' ')} evidence is missing or rejected.` });
      continue;
    }
    const expiry = asDate(document.expiryDate);
    if (expiry && expiry.getTime() < now.getTime()) blockers.push({ code: 'EXPIRED_DOCUMENT', message: `${type.replace(/_/gu, ' ')} evidence is expired.` });
    if (!document.hasDocumentNumber && ['PAN_CARD', 'GST_CERTIFICATE', 'AUTHORIZED_PERSON_ID'].includes(type)) {
      blockers.push({ code: 'MISSING_DOCUMENT_NUMBER', message: `${type.replace(/_/gu, ' ')} needs a verified document number.` });
    }
    if (['UPLOADED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(document.status)) {
      blockers.push({ code: 'REVIEW_PENDING', message: `${type.replace(/_/gu, ' ')} still needs reviewer confirmation.` });
    }
  }
  const readinessScore = Math.max(0, Math.round(100 - (blockers.length / Math.max(1, requiredTypes.length * 1.5)) * 100));
  return {
    readinessScore,
    priority: blockers.some((item) => ['MISSING_DOCUMENT', 'EXPIRED_DOCUMENT'].includes(item.code)) ? 'HIGH' : blockers.length ? 'MEDIUM' : 'LOW',
    blockers,
    recommendations: blockers.length
      ? ['Keep the case in review until the listed evidence is replaced or confirmed by an authorized reviewer.', 'Compare extracted fields with the original document and trusted verification response before any decision.']
      : ['Evidence appears complete for the configured checklist; an authorized reviewer must still approve the case.'],
  };
};

export type RtoReviewInput = {
  rtoStatus: string;
  taxStatus: string;
  fitnessStatus: string;
  insuranceStatus: string;
  pucStatus: string;
  hsrpStatus: string;
  pendingTasks: number;
  optionalPendingTasks: number;
};

export const buildRtoReview = (input: RtoReviewInput) => {
  const blockers: string[] = [];
  const acceptable = (value: string, allowed: string[]) => allowed.includes(value.toUpperCase());
  if (!acceptable(input.taxStatus, ['VALID', 'LIFETIME', 'NOT_APPLICABLE'])) blockers.push('Tax status needs verification or renewal.');
  if (!acceptable(input.fitnessStatus, ['VALID', 'LIFETIME', 'NOT_APPLICABLE'])) blockers.push('Fitness status needs verification or renewal.');
  if (!acceptable(input.insuranceStatus, ['VALID', 'LIFETIME', 'NOT_APPLICABLE'])) blockers.push('Insurance evidence is missing, expired, or not verified.');
  if (!acceptable(input.pucStatus, ['VALID', 'LIFETIME', 'NOT_APPLICABLE'])) blockers.push('PUC status needs verification or renewal.');
  if (!acceptable(input.hsrpStatus, ['YES', 'NOT_APPLICABLE'])) blockers.push('HSRP status needs confirmation.');
  if (input.pendingTasks > 0) blockers.push(`${input.pendingTasks} transfer task(s) are pending.`);
  const priority: ReviewPriority = blockers.some((item) => /insurance|tax|pending/iu.test(item)) ? 'HIGH' : blockers.length ? 'MEDIUM' : 'LOW';
  return {
    priority,
    blockers: blockers.map((message, index) => ({ code: `RTO_BLOCKER_${index + 1}`, message })),
    taskSummary: { pending: input.pendingTasks, optionalPending: input.optionalPendingTasks },
    recommendations: blockers.length
      ? ['Assign the blocker to the RTO owner and request the missing evidence from the partner or customer.', 'Do not mark transfer complete until required statuses and documents are confirmed.']
      : ['Continue the configured RTO checklist and retain the original evidence for final human review.'],
  };
};

export const buildFinanceReview = (input: { periodDays: number; inflow: number; outflow: number; net: number; overdueCount: number; overdueAmount: number }) => {
  const cashflowSignal = input.net < 0 ? 'NEGATIVE' : input.net === 0 ? 'FLAT' : 'POSITIVE';
  const priority: ReviewPriority = input.overdueAmount > 0 || input.net < 0 ? 'HIGH' : input.outflow > input.inflow * 0.8 ? 'MEDIUM' : 'LOW';
  const recommendations = [
    ...(input.overdueCount > 0 ? [`Review ${input.overdueCount} overdue collection item(s) totalling approximately ₹${Math.round(input.overdueAmount).toLocaleString('en-IN')}.`] : []),
    ...(input.net < 0 ? ['Review outflows, upcoming obligations, and collection timing before committing new spend.'] : []),
    ...(input.overdueCount === 0 && input.net >= 0 ? ['Continue normal reconciliation and monitor the next reporting period.'] : []),
  ];
  return { periodDays: input.periodDays, cashflowSignal, priority, recommendations };
};

export const buildFraudReview = (input: { price: number; comparableMedian: number | null; identityConflict: boolean; duplicateMediaCount: number; paymentAnomaly: boolean; repeatedAccountSignals: number }) => {
  const signals: string[] = [];
  if (input.identityConflict) signals.push('Vehicle identity fields conflict with trusted verification evidence.');
  if (input.duplicateMediaCount > 0) signals.push(`${input.duplicateMediaCount} media item(s) appear reused across listings.`);
  if (input.paymentAnomaly) signals.push('Payment evidence has an anomaly requiring finance review.');
  if (input.repeatedAccountSignals > 0) signals.push('Account behaviour shows repeated or unusual signals.');
  if (input.comparableMedian && input.price < input.comparableMedian * 0.65) signals.push('Price is materially below the comparable listing median.');
  const riskLevel = input.identityConflict || input.paymentAnomaly || signals.length >= 3 ? 'HIGH' : signals.length ? 'MEDIUM' : 'LOW';
  return {
    riskLevel,
    signals,
    recommendation: signals.length ? 'Hold the record for human review; validate the original evidence and deterministic identity/payment checks before publishing or enforcement.' : 'No strong anomaly signal was found by the configured checks; continue normal moderation.',
  };
};

export const buildPartnerReview = (input: { publishedListings: number; totalListings: number; soldListings: number; unansweredLeads: number; averageResponseHours: number | null }) => {
  const recommendations = [
    ...(input.unansweredLeads > 0 ? [`Prioritize ${input.unansweredLeads} unanswered lead(s) and review the response SLA.`] : []),
    ...(input.averageResponseHours !== null && input.averageResponseHours > 24 ? ['Coach the partner on first-response speed and follow-up ownership.'] : []),
    ...(input.totalListings > 0 && input.publishedListings / input.totalListings < 0.5 ? ['Review incomplete or paused inventory and help the partner activate quality stock.'] : []),
    ...(input.soldListings === 0 && input.totalListings > 0 ? ['Review pricing, demand fit, and listing quality before adding more inventory.'] : []),
  ];
  return { health: recommendations.length >= 2 ? 'AT_RISK' : recommendations.length ? 'WATCH' : 'HEALTHY', recommendations };
};

export const buildRecruitmentReview = (input: { activeJobs: number; newApplications: number; underReview: number; interviewsScheduled: number; offersSent: number; hiredCandidates: number }) => ({
  recommendations: [
    ...(input.newApplications > 0 && input.underReview === 0 ? ['Start structured screening for new applications before the pipeline becomes stale.'] : []),
    ...(input.underReview > 0 && input.interviewsScheduled === 0 ? ['Schedule interviews for reviewed candidates using the approved scorecard.'] : []),
    ...(input.offersSent > 0 && input.hiredCandidates === 0 ? ['Follow up on open offers and complete onboarding checks; do not auto-select candidates.'] : []),
    ...(input.activeJobs === 0 ? ['Review workforce demand before opening a new recruitment campaign.'] : []),
  ],
});
