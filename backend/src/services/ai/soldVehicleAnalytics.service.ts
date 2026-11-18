import { Prisma, type PrismaClient } from '@prisma/client';
import { buildForecast, type ForecastObservation } from './aiForecasting.service';
import {
  reconcileSoldVehicleFinancials,
  type SoldVehicleFinancialReconciliationInput,
  type SoldVehicleFinancialReconciliation,
} from './soldVehicleFinancialReconciliation.service';

export type SoldVehicleAnalyticsMetric =
  | 'overview'
  | 'profit_loss'
  | 'payments'
  | 'refunds'
  | 'rto_delay'
  | 'documents'
  | 'collection_risk'
  | 'low_margin'
  | 'model_performance'
  | 'monthly_comparison'
  | 'forecast'
  | 'suggestions';

export type SoldVehicleAnalyticsArguments = {
  dealId?: string;
  recordNumber?: string;
  from?: string;
  to?: string;
  days?: number;
  metric?: SoldVehicleAnalyticsMetric;
  horizon?: number;
  lowMarginThresholdPercent?: number;
  limit?: number;
};

export type SoldVehicleAnalyticsDeal = {
  id: string;
  recordNumber: string;
  listingId?: string | null;
  vehicleNumber?: string | null;
  brandName?: string | null;
  vehicleModel?: string | null;
  purchaseAmount?: number | string | null;
  sellAmount?: number | string | null;
  expenses?: number | string | null;
  purchaseExchangeValue?: number | string | null;
  saleExchangeValue?: number | string | null;
  gstRatePercent?: number | string | null;
  taxMode?: string | null;
  marginBasis?: string | null;
  sellerState?: string | null;
  purchaserState?: string | null;
  balanceAmount?: number | string | null;
  netProfit?: number | string | null;
  netProfitAfterGst?: number | string | null;
  isDraft: boolean;
  cancelledAt?: string | Date | null;
  completedAt?: string | Date | null;
  sellDate?: string | Date | null;
  createdAt: string | Date;
  dealStatus?: string | null;
  expenseBreakdown?: unknown;
  documents?: unknown;
  payments: Array<{
    id?: string | null;
    side?: string | null;
    amount?: number | string | null;
    receiptStatus?: string | null;
    cancelledAt?: string | Date | null;
    paymentDate?: string | Date | null;
    method?: string | null;
    reference?: string | null;
    receiptNumber?: string | null;
    listingPaymentId?: string | null;
  }>;
  refunds: Array<{
    id?: string | null;
    status?: string | null;
    amount?: number | string | null;
    forfeitAmount?: number | string | null;
    refundDate?: string | Date | null;
    paidAt?: string | Date | null;
  }>;
  rtoRecord?: {
    id: string;
    rtoStatus?: string | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
    documentSendDate?: string | Date | null;
    statusLogs: Array<{ createdAt?: string | Date | null; newStatus?: string | null }>;
    transferTasks: Array<{
      id?: string | null;
      taskKey?: string | null;
      label?: string | null;
      status?: string | null;
      isOptional?: boolean;
      documents?: unknown;
      createdAt?: string | Date | null;
      updatedAt?: string | Date | null;
    }>;
  } | null;
  listing?: { brandName?: string | null; modelName?: string | null } | null;
};

export type SoldVehicleAnalyticsInput = {
  deals: SoldVehicleAnalyticsDeal[];
  from: Date;
  to: Date;
  metric?: SoldVehicleAnalyticsMetric;
  lowMarginThresholdPercent?: number;
  limit?: number;
  exactDeal?: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_DOCUMENT_KEYS = [
  'purchaseDeed',
  'purchaseAadhaarCard',
  'purchasePanCard',
  'purchaseGstCertificate',
  'sellDeed',
  'sellAadhaarCard',
  'sellPanCard',
  'sellGstCertificate',
] as const;

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const positive = (value: unknown) => Math.max(0, number(value));
const iso = (value: string | Date | null | undefined) => value instanceof Date ? value.toISOString() : value ?? null;
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const dateOnly = (value: string | Date | null | undefined) => {
  const normalized = iso(value);
  return normalized ? normalized.slice(0, 10) : null;
};
const dayStart = (value: Date) => {
  const result = new Date(value);
  result.setUTCHours(0, 0, 0, 0);
  return result;
};
const dayEnd = (value: Date) => {
  const result = dayStart(value);
  result.setUTCHours(23, 59, 59, 999);
  return result;
};
const daysBetween = (from: Date, to: Date) => Math.max(1, Math.floor((dayStart(to).getTime() - dayStart(from).getTime()) / DAY_MS) + 1);
const effectiveDate = (deal: SoldVehicleAnalyticsDeal) => deal.sellDate ?? deal.completedAt ?? deal.createdAt;
const dealModel = (deal: SoldVehicleAnalyticsDeal) => deal.vehicleModel || deal.listing?.modelName || 'Unspecified model';
const dealBrand = (deal: SoldVehicleAnalyticsDeal) => deal.brandName || deal.listing?.brandName || 'Unspecified brand';

const hasDocumentValue = (value: unknown) => {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
};

const documentStatusFor = (deal: SoldVehicleAnalyticsDeal) => {
  const documents = deal.documents && typeof deal.documents === 'object' && !Array.isArray(deal.documents)
    ? deal.documents as Record<string, unknown>
    : {};
  const accountFiles = KNOWN_DOCUMENT_KEYS.filter((key) => hasDocumentValue(documents[key]));
  const rtoFiles = deal.rtoRecord?.transferTasks.flatMap((task) => {
    const files = Array.isArray(task.documents) ? task.documents : [];
    return files.filter(hasDocumentValue).map(() => task.taskKey || task.label || 'RTO task');
  }) ?? [];
  const availableFiles = [...accountFiles, ...rtoFiles];
  return {
    available: availableFiles.length > 0,
    availableCount: availableFiles.length,
    availableFiles,
    missingKnownSlots: KNOWN_DOCUMENT_KEYS.filter((key) => !accountFiles.includes(key)),
    rtoTaskCount: deal.rtoRecord?.transferTasks.length ?? 0,
    rtoTaskDocumentCount: rtoFiles.length,
  };
};

const rtoDelayFor = (deal: SoldVehicleAnalyticsDeal, asOf: Date) => {
  const rto = deal.rtoRecord;
  if (!rto) return { hasRto: false, status: null, delayDays: null, delayed: false, pendingTaskCount: 0, completedTaskCount: 0 };
  const status = String(rto.rtoStatus || 'PENDING');
  const done = ['COMPLETED', 'RTO_WORK_COMPLETED', 'DEAL_DONE'].includes(status);
  const started = rto.createdAt ?? effectiveDate(deal);
  const end = done ? (rto.updatedAt ?? asOf) : asOf;
  const delayDays = Math.max(0, Math.floor((dayStart(new Date(end)).getTime() - dayStart(new Date(started)).getTime()) / DAY_MS));
  const pendingTaskCount = rto.transferTasks.filter((task) => !['TRANSFERRED', 'NOT_REQUIRED'].includes(String(task.status))).length;
  const completedTaskCount = rto.transferTasks.length - pendingTaskCount;
  return { hasRto: true, status, delayDays, delayed: !done && delayDays > 7, pendingTaskCount, completedTaskCount };
};

const collectionRiskFor = (deal: SoldVehicleAnalyticsDeal, reconciliation: SoldVehicleFinancialReconciliation, asOf: Date) => {
  const outstanding = reconciliation.payments.customer.balance;
  const overdueDays = Math.max(0, Math.floor((dayStart(asOf).getTime() - dayStart(new Date(effectiveDate(deal))).getTime()) / DAY_MS));
  const reasons: string[] = [];
  let score = 0;
  if (outstanding > 0) { score += 50; reasons.push(`Customer outstanding is ${round(outstanding)}.`); }
  if (overdueDays > 30) { score += 25; reasons.push(`Outstanding age is ${overdueDays} days.`); }
  else if (overdueDays > 7) { score += 15; reasons.push(`Outstanding age is ${overdueDays} days.`); }
  if (reconciliation.payments.customer.status === 'PARTIAL') { score += 10; reasons.push('Customer payment is partial.'); }
  if (reconciliation.payments.customer.realAmount <= 0 && outstanding > 0) { score += 15; reasons.push('No real customer receipt is recorded.'); }
  const level = score >= 80 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW';
  return { level, score, outstanding, overdueDays, reasons };
};

const emptyPeriod = (from: Date, to: Date) => ({
  period: `${dateKey(from).slice(0, 7)}`,
  from: dateKey(from),
  to: dateKey(to),
  deals: 0,
  revenue: 0,
  purchase: 0,
  expenses: 0,
  profitAfterGst: 0,
  outstanding: 0,
});

const summaryForDeals = (items: Array<{ deal: SoldVehicleAnalyticsDeal; reconciliation: SoldVehicleFinancialReconciliation; collectionRisk: ReturnType<typeof collectionRiskFor>; documentStatus: ReturnType<typeof documentStatusFor>; rtoDelay: ReturnType<typeof rtoDelayFor> }>, excluded: { total: number; cancelled: number; draft: number }) => {
  const sum = (getter: (item: typeof items[number]) => number) => round(items.reduce((total, item) => total + getter(item), 0));
  return {
    totalDealsRead: items.length + excluded.total,
    eligibleDeals: items.length,
    excludedDeals: excluded.total,
    cancelledDeals: excluded.cancelled,
    draftDeals: excluded.draft,
    revenue: sum((item) => positive(item.deal.sellAmount)),
    purchase: sum((item) => positive(item.deal.purchaseAmount)),
    expenses: sum((item) => positive(item.deal.expenses)),
    profitAfterGst: sum((item) => item.reconciliation.amounts.profitAfterGst),
    lossDeals: items.filter((item) => item.reconciliation.amounts.result === 'LOSS').length,
    averageMarginPercent: items.length ? round(items.reduce((total, item) => total + (item.reconciliation.amounts.marginPercentAfterGst ?? 0), 0) / items.length) : null,
    highCollectionRiskDeals: items.filter((item) => item.collectionRisk.level === 'HIGH').length,
    rtoDelayedDeals: items.filter((item) => item.rtoDelay.delayed).length,
    dealsWithoutDocuments: items.filter((item) => !item.documentStatus.available).length,
  };
};

const buildMonthlyComparison = (items: ReturnType<typeof buildEligibleItems>, from: Date, to: Date) => {
  const current = emptyPeriod(from, to);
  const periodDays = daysBetween(from, to);
  const previousTo = new Date(dayStart(from).getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - ((periodDays - 1) * DAY_MS));
  const previous = emptyPeriod(previousFrom, previousTo);
  const assign = (target: typeof current, item: ReturnType<typeof buildEligibleItems>[number]) => {
    target.deals += 1;
    target.revenue = round(target.revenue + positive(item.deal.sellAmount));
    target.purchase = round(target.purchase + positive(item.deal.purchaseAmount));
    target.expenses = round(target.expenses + positive(item.deal.expenses));
    target.profitAfterGst = round(target.profitAfterGst + item.reconciliation.amounts.profitAfterGst);
    target.outstanding = round(target.outstanding + item.reconciliation.payments.customer.balance);
  };
  items.forEach((item) => {
    const date = new Date(effectiveDate(item.deal));
    if (date >= from && date <= to) assign(current, item);
    else if (date >= previousFrom && date <= previousTo) assign(previous, item);
  });
  const changePercent = (currentValue: number, previousValue: number) => previousValue === 0 ? null : round(((currentValue - previousValue) / Math.abs(previousValue)) * 100);
  return {
    current,
    previous,
    changePercent: {
      deals: changePercent(current.deals, previous.deals),
      revenue: changePercent(current.revenue, previous.revenue),
      profitAfterGst: changePercent(current.profitAfterGst, previous.profitAfterGst),
      outstanding: changePercent(current.outstanding, previous.outstanding),
    },
    limitations: previous.deals === 0 ? ['Previous comparison period has no eligible Sold Vehicle deals; percentage change is unavailable.'] : [],
  };
};

type EligibleItem = {
  deal: SoldVehicleAnalyticsDeal;
  reconciliation: SoldVehicleFinancialReconciliation;
  collectionRisk: ReturnType<typeof collectionRiskFor>;
  documentStatus: ReturnType<typeof documentStatusFor>;
  rtoDelay: ReturnType<typeof rtoDelayFor>;
};

const buildEligibleItems = (input: SoldVehicleAnalyticsInput): EligibleItem[] => input.deals
  .filter((deal) => !deal.isDraft && !deal.cancelledAt)
  .filter((deal) => {
    if (input.exactDeal) return true;
    const date = new Date(effectiveDate(deal));
    return date >= input.from && date <= input.to;
  })
  .map((deal) => {
    const reconciliationInput: SoldVehicleFinancialReconciliationInput = {
      ...(deal.purchaseAmount !== undefined ? { purchaseAmount: deal.purchaseAmount } : {}),
      ...(deal.sellAmount !== undefined ? { sellAmount: deal.sellAmount } : {}),
      ...(deal.expenses !== undefined ? { expenses: deal.expenses } : {}),
      ...(deal.purchaseExchangeValue !== undefined ? { purchaseExchangeValue: deal.purchaseExchangeValue } : {}),
      ...(deal.saleExchangeValue !== undefined ? { saleExchangeValue: deal.saleExchangeValue } : {}),
      ...(deal.gstRatePercent !== undefined ? { gstRatePercent: deal.gstRatePercent } : {}),
      ...(deal.taxMode !== undefined ? { taxMode: deal.taxMode } : {}),
      ...(deal.marginBasis !== undefined ? { marginBasis: deal.marginBasis } : {}),
      ...(deal.sellerState !== undefined ? { sellerState: deal.sellerState } : {}),
      ...(deal.purchaserState !== undefined ? { purchaserState: deal.purchaserState } : {}),
      ...(deal.expenseBreakdown !== undefined ? { expenseBreakdown: deal.expenseBreakdown } : {}),
      payments: deal.payments,
      refunds: deal.refunds,
      source: {
        ...(deal.balanceAmount !== undefined ? { balanceAmount: deal.balanceAmount } : {}),
        ...(deal.netProfit !== undefined ? { netProfit: deal.netProfit } : {}),
        ...(deal.netProfitAfterGst !== undefined ? { netProfitAfterGst: deal.netProfitAfterGst } : {}),
      },
      cancelled: Boolean(deal.cancelledAt),
    };
    const reconciliation = reconcileSoldVehicleFinancials(reconciliationInput);
    return {
      deal,
      reconciliation,
      collectionRisk: collectionRiskFor(deal, reconciliation, input.to),
      documentStatus: documentStatusFor(deal),
      rtoDelay: rtoDelayFor(deal, input.to),
    };
  });

const modelPerformanceFor = (items: EligibleItem[], limit: number) => {
  const groups = new Map<string, { brand: string; model: string; deals: number; revenue: number; purchase: number; expenses: number; profitAfterGst: number; outstanding: number; lossDeals: number }>();
  items.forEach((item) => {
    const brand = dealBrand(item.deal);
    const model = dealModel(item.deal);
    const key = `${brand}::${model}`;
    const existing = groups.get(key) ?? { brand, model, deals: 0, revenue: 0, purchase: 0, expenses: 0, profitAfterGst: 0, outstanding: 0, lossDeals: 0 };
    existing.deals += 1;
    existing.revenue = round(existing.revenue + positive(item.deal.sellAmount));
    existing.purchase = round(existing.purchase + positive(item.deal.purchaseAmount));
    existing.expenses = round(existing.expenses + positive(item.deal.expenses));
    existing.profitAfterGst = round(existing.profitAfterGst + item.reconciliation.amounts.profitAfterGst);
    existing.outstanding = round(existing.outstanding + item.reconciliation.payments.customer.balance);
    if (item.reconciliation.amounts.result === 'LOSS') existing.lossDeals += 1;
    groups.set(key, existing);
  });
  const itemsByRevenue = [...groups.values()].map((item) => ({
    ...item,
    averageProfitAfterGst: item.deals ? round(item.profitAfterGst / item.deals) : 0,
    marginPercent: item.revenue ? round((item.profitAfterGst / item.revenue) * 100) : null,
  })).sort((left, right) => right.revenue - left.revenue).slice(0, limit);
  return { items: itemsByRevenue, totalModels: groups.size };
};

const buildSuggestions = (items: EligibleItem[], modelPerformance: ReturnType<typeof modelPerformanceFor>, monthlyComparison: ReturnType<typeof buildMonthlyComparison>) => {
  const suggestions: Array<{ title: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; evidence: string[] }> = [];
  const highRisk = items.filter((item) => item.collectionRisk.level === 'HIGH');
  const lowMargin = items.filter((item) => (item.reconciliation.amounts.marginPercentAfterGst ?? 0) < 10);
  const delayed = items.filter((item) => item.rtoDelay.delayed);
  const missingDocs = items.filter((item) => !item.documentStatus.available);
  if (highRisk.length) suggestions.push({ title: 'Prioritize customer collection follow-up', priority: 'HIGH', evidence: highRisk.slice(0, 5).map((item) => `${item.deal.recordNumber}: outstanding ${round(item.collectionRisk.outstanding)}`) });
  if (lowMargin.length) suggestions.push({ title: 'Review low-margin deals before approving similar pricing', priority: 'HIGH', evidence: lowMargin.slice(0, 5).map((item) => `${item.deal.recordNumber}: margin ${item.reconciliation.amounts.marginPercentAfterGst ?? 0}%`) });
  if (delayed.length) suggestions.push({ title: 'Escalate delayed RTO work and clear pending tasks', priority: 'MEDIUM', evidence: delayed.slice(0, 5).map((item) => `${item.deal.recordNumber}: ${item.rtoDelay.delayDays} days, ${item.rtoDelay.pendingTaskCount} pending task(s)`) });
  if (missingDocs.length) suggestions.push({ title: 'Complete missing deal/RTO document uploads', priority: 'MEDIUM', evidence: missingDocs.slice(0, 5).map((item) => item.deal.recordNumber) });
  const weakest = modelPerformance.items.filter((item) => item.marginPercent !== null).sort((left, right) => (left.marginPercent ?? 0) - (right.marginPercent ?? 0))[0];
  if (weakest && (weakest.marginPercent ?? 0) < 10) suggestions.push({ title: `Recheck pricing and expenses for ${weakest.brand} ${weakest.model}`, priority: 'MEDIUM', evidence: [`Model margin ${weakest.marginPercent}% across ${weakest.deals} deal(s).`] });
  if (monthlyComparison.changePercent.profitAfterGst !== null && (monthlyComparison.changePercent.profitAfterGst ?? 0) < 0) suggestions.push({ title: 'Investigate month-on-month profit decline', priority: 'MEDIUM', evidence: [`Profit change ${monthlyComparison.changePercent.profitAfterGst}% versus the previous period.`] });
  if (!suggestions.length) suggestions.push({ title: 'No source-backed urgent action identified', priority: 'LOW', evidence: ['The selected data range has no high-risk collection, low-margin, delayed-RTO or missing-document signal.'] });
  return suggestions;
};

export const buildSoldVehicleAnalytics = (input: SoldVehicleAnalyticsInput) => {
  const metric = input.metric ?? 'overview';
  const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20)));
  const lowMarginThresholdPercent = Number.isFinite(input.lowMarginThresholdPercent) ? Number(input.lowMarginThresholdPercent) : 10;
  const matching = input.exactDeal
    ? input.deals
    : input.deals.filter((deal) => {
      const date = new Date(effectiveDate(deal));
      return date >= input.from && date <= input.to;
    });
  const eligible = buildEligibleItems({ ...input, deals: matching });
  const excludedRows = matching.filter((deal) => deal.isDraft || Boolean(deal.cancelledAt));
  const summary = summaryForDeals(eligible, {
    total: excludedRows.length,
    cancelled: excludedRows.filter((deal) => Boolean(deal.cancelledAt)).length,
    draft: excludedRows.filter((deal) => deal.isDraft).length,
  });
  const modelPerformance = modelPerformanceFor(eligible, limit);
  const previousTo = new Date(dayStart(input.from).getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - ((daysBetween(input.from, input.to) - 1) * DAY_MS));
  const comparisonEligible = input.exactDeal ? [] : buildEligibleItems({
    ...input,
    exactDeal: false,
    from: previousFrom,
    to: previousTo,
    deals: input.deals,
  });
  const monthlyComparison = buildMonthlyComparison([...eligible, ...comparisonEligible], input.from, input.to);
  const financialItems = eligible.map((item) => ({
    recordNumber: item.deal.recordNumber,
    dealId: item.deal.id,
    vehicleNumber: item.deal.vehicleNumber ?? null,
    model: dealModel(item.deal),
    brand: dealBrand(item.deal),
    date: dateOnly(effectiveDate(item.deal)),
    reconciliation: item.reconciliation,
  }));
  const lowMarginDeals = eligible.filter((item) => (item.reconciliation.amounts.marginPercentAfterGst ?? 0) < lowMarginThresholdPercent).map((item) => ({
    dealId: item.deal.id,
    recordNumber: item.deal.recordNumber,
    model: dealModel(item.deal),
    marginPercent: item.reconciliation.amounts.marginPercentAfterGst,
    profitAfterGst: item.reconciliation.amounts.profitAfterGst,
  }));
  const riskItems = eligible.map((item) => ({ dealId: item.deal.id, recordNumber: item.deal.recordNumber, vehicleNumber: item.deal.vehicleNumber ?? null, ...item.collectionRisk }));
  const rtoItems = eligible.filter((item) => item.rtoDelay.hasRto).map((item) => ({ dealId: item.deal.id, recordNumber: item.deal.recordNumber, vehicleNumber: item.deal.vehicleNumber ?? null, ...item.rtoDelay }));
  const documentItems = eligible.map((item) => ({ dealId: item.deal.id, recordNumber: item.deal.recordNumber, vehicleNumber: item.deal.vehicleNumber ?? null, ...item.documentStatus }));
  const result = {
    source: 'database' as const,
    status: eligible.length ? 'READY' as const : 'NO_DATA' as const,
    metric,
    dateRange: { from: dateKey(input.from), to: dateKey(input.to) },
    assumptions: [
      'Only non-draft, non-cancelled SellAccount records whose effective sale date falls inside the selected range are included.',
      'Profit and balances use the canonical sell-account finance reconciliation; draft/cancelled receipts are excluded from settled money.',
      `Low-margin threshold is ${lowMarginThresholdPercent}%, calculated on reconciled post-GST margin.`,
      'RTO delay uses the RTO record creation date through the selected as-of date unless a completed status is source-recorded.',
    ],
    summary,
    financials: {
      purchaseAmount: summary.purchase,
      saleAmount: summary.revenue,
      expenses: summary.expenses,
      profitAfterGst: summary.profitAfterGst,
      lossDeals: summary.lossDeals,
      marginPercent: summary.revenue ? round((summary.profitAfterGst / summary.revenue) * 100) : null,
      items: financialItems.slice(0, limit),
    },
    payments: {
      customer: {
        expected: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.customer.expectedAmount, 0)),
        received: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.customer.realAmount, 0)),
        refunded: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.customer.refundedAmount, 0)),
        outstanding: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.customer.balance, 0)),
      },
      seller: {
        payable: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.seller.expectedAmount, 0)),
        paid: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.seller.realAmount, 0)),
        outstanding: round(eligible.reduce((sum, item) => sum + item.reconciliation.payments.seller.balance, 0)),
      },
      rows: financialItems.slice(0, limit),
    },
    refunds: {
      requested: round(eligible.reduce((sum, item) => sum + item.reconciliation.refunds.requestedAmount, 0)),
      approved: round(eligible.reduce((sum, item) => sum + item.reconciliation.refunds.approvedAmount, 0)),
      paid: round(eligible.reduce((sum, item) => sum + item.reconciliation.refunds.paidAmount, 0)),
      pending: round(eligible.reduce((sum, item) => sum + item.reconciliation.refunds.pendingAmount, 0)),
      rejected: round(eligible.reduce((sum, item) => sum + item.reconciliation.refunds.rejectedAmount, 0)),
      count: eligible.reduce((sum, item) => sum + item.reconciliation.refunds.count, 0),
    },
    lowMarginDeals: { thresholdPercent: lowMarginThresholdPercent, count: lowMarginDeals.length, items: lowMarginDeals.slice(0, limit) },
    collectionRisk: {
      highRiskCount: riskItems.filter((item) => item.level === 'HIGH').length,
      mediumRiskCount: riskItems.filter((item) => item.level === 'MEDIUM').length,
      lowRiskCount: riskItems.filter((item) => item.level === 'LOW').length,
      items: riskItems.sort((left, right) => right.score - left.score).slice(0, limit),
    },
    rtoDelay: {
      pendingDealCount: rtoItems.filter((item) => item.delayed).length,
      items: rtoItems.sort((left, right) => (right.delayDays ?? 0) - (left.delayDays ?? 0)).slice(0, limit),
    },
    documents: {
      missingDealCount: documentItems.filter((item) => !item.available).length,
      readyDealCount: documentItems.filter((item) => item.available).length,
      items: documentItems.slice(0, limit),
    },
    modelPerformance,
    monthlyComparison,
    suggestions: buildSuggestions(eligible, modelPerformance, monthlyComparison),
    limitations: eligible.length ? [] : ['No eligible source-backed Sold Vehicle records exist in the selected date range.'],
  };
  return result;
};

const buildDailyObservations = (deals: SoldVehicleAnalyticsDeal[], from: Date, to: Date) => {
  const revenue = new Map<string, number>();
  const cashFlow = new Map<string, number>();
  const add = (map: Map<string, number>, date: string | null, value: number) => {
    if (!date) return;
    map.set(date, round((map.get(date) ?? 0) + value));
  };
  deals.filter((deal) => !deal.isDraft && !deal.cancelledAt).forEach((deal) => {
    add(revenue, dateOnly(effectiveDate(deal)), positive(deal.sellAmount));
    deal.payments.forEach((payment) => {
      if ((payment.receiptStatus ?? 'ISSUED') !== 'ISSUED' || payment.cancelledAt) return;
      const value = positive(payment.amount) * (payment.side === 'SELLER_PAYMENT' ? -1 : 1);
      add(cashFlow, dateOnly(payment.paymentDate), value);
    });
    deal.refunds.filter((refund) => refund.status === 'PAID').forEach((refund) => add(cashFlow, dateOnly(refund.paidAt ?? refund.refundDate), -positive(refund.amount)));
  });
  const observations = (map: Map<string, number>): ForecastObservation[] => Array.from({ length: daysBetween(from, to) }, (_, index) => {
    const date = new Date(dayStart(from).getTime() + (index * DAY_MS));
    const key = dateKey(date);
    return { date: key, value: map.get(key) ?? 0 };
  });
  return { revenue: observations(revenue), cashFlow: observations(cashFlow) };
};

export const buildSoldVehicleForecast = (input: { deals: SoldVehicleAnalyticsDeal[]; from: Date; to: Date; horizonDays?: number }) => {
  const horizonDays = Math.min(30, Math.max(1, Math.floor(input.horizonDays ?? 7)));
  const historicalDays = daysBetween(input.from, input.to);
  const observations = buildDailyObservations(input.deals, input.from, input.to);
  const revenue = buildForecast({ metric: 'finance', historicalDays, horizonDays, observations: observations.revenue });
  const cashFlow = buildForecast({ metric: 'finance', historicalDays, horizonDays, observations: observations.cashFlow });
  const lastHistoricalDate = dayStart(input.to);
  const forecastFrom = new Date(lastHistoricalDate.getTime() + DAY_MS);
  const forecastTo = new Date(lastHistoricalDate.getTime() + (horizonDays * DAY_MS));
  const confidenceScore = Math.min(revenue.confidenceScore, cashFlow.confidenceScore);
  const daily = revenue.forecast.daily.map((point, index) => ({
    date: point.date,
    revenue: point.value,
    revenueLower: point.lower,
    revenueUpper: point.upper,
    cashFlow: cashFlow.forecast.daily[index]?.value ?? 0,
    cashFlowLower: cashFlow.forecast.daily[index]?.lower ?? 0,
    cashFlowUpper: cashFlow.forecast.daily[index]?.upper ?? 0,
  }));
  return {
    source: 'database' as const,
    status: revenue.status === 'READY' && cashFlow.status === 'READY' ? 'READY' as const : 'INSUFFICIENT_DATA' as const,
    historical: {
      dateRange: { from: dateKey(input.from), to: dateKey(input.to) },
      days: historicalDays,
      revenue: revenue.historical,
      cashFlow: cashFlow.historical,
    },
    forecast: {
      dateRange: { from: dateKey(forecastFrom), to: dateKey(forecastTo) },
      horizonDays,
      revenueTotal: revenue.forecast.total,
      cashFlowTotal: cashFlow.forecast.total,
      daily,
    },
    confidence: { score: confidenceScore, label: confidenceScore >= 75 ? 'HIGH' : confidenceScore >= 50 ? 'MEDIUM' : 'LOW' },
    assumptions: [
      'Revenue is recognized on the effective Sold Vehicle date: sellDate, then completedAt, then createdAt.',
      'Cash flow includes issued customer receipts, subtracts issued seller payments and paid refunds; draft/cancelled receipts are excluded.',
      'The projection uses the historical daily baseline plus least-squares trend and residual uncertainty; it is directional, not guaranteed.',
    ],
    method: 'Recent 7-day baseline plus least-squares linear trend for separate revenue and cash-flow series.',
    limitations: [...new Set([...revenue.limitations, ...cashFlow.limitations])],
  };
};

const analyticsSelect = {
  id: true,
  recordNumber: true,
  listingId: true,
  vehicleNumber: true,
  brandName: true,
  vehicleModel: true,
  purchaseAmount: true,
  sellAmount: true,
  expenses: true,
  purchaseExchangeValue: true,
  saleExchangeValue: true,
  gstRatePercent: true,
  taxMode: true,
  marginBasis: true,
  sellerState: true,
  purchaserState: true,
  balanceAmount: true,
  netProfit: true,
  netProfitAfterGst: true,
  isDraft: true,
  cancelledAt: true,
  completedAt: true,
  sellDate: true,
  createdAt: true,
  dealStatus: true,
  expenseBreakdown: true,
  documents: true,
  payments: { orderBy: { paymentDate: 'asc' as const }, select: { id: true, side: true, amount: true, receiptStatus: true, cancelledAt: true, paymentDate: true, method: true, reference: true, receiptNumber: true, listingPaymentId: true } },
  refunds: { orderBy: { createdAt: 'asc' as const }, select: { id: true, status: true, amount: true, forfeitAmount: true, refundDate: true, paidAt: true } },
  rtoRecord: { select: { id: true, rtoStatus: true, createdAt: true, updatedAt: true, documentSendDate: true, statusLogs: { orderBy: { createdAt: 'asc' as const }, select: { createdAt: true, newStatus: true } }, transferTasks: { orderBy: { sortOrder: 'asc' as const }, select: { id: true, taskKey: true, label: true, status: true, isOptional: true, documents: true, createdAt: true, updatedAt: true } } } },
  listing: { select: { brand: { select: { name: true } }, model: { select: { name: true } } } },
} as const;

type AnalyticsDb = Pick<PrismaClient, 'sellAccount'>;
type AnalyticsDbDeal = Prisma.SellAccountGetPayload<{ select: typeof analyticsSelect }>;

const toAnalyticsDeal = (row: AnalyticsDbDeal): SoldVehicleAnalyticsDeal => ({
  ...row,
  purchaseAmount: Number(row.purchaseAmount),
  sellAmount: Number(row.sellAmount),
  expenses: Number(row.expenses),
  purchaseExchangeValue: Number(row.purchaseExchangeValue),
  saleExchangeValue: Number(row.saleExchangeValue),
  gstRatePercent: Number(row.gstRatePercent),
  balanceAmount: Number(row.balanceAmount),
  netProfit: Number(row.netProfit),
  netProfitAfterGst: Number(row.netProfitAfterGst),
  taxMode: String(row.taxMode),
  marginBasis: String(row.marginBasis),
  dealStatus: String(row.dealStatus),
  payments: row.payments.map((payment) => ({ ...payment, amount: Number(payment.amount), side: String(payment.side), receiptStatus: String(payment.receiptStatus), method: String(payment.method) })),
  refunds: row.refunds.map((refund) => ({ ...refund, amount: Number(refund.amount), forfeitAmount: Number(refund.forfeitAmount), status: String(refund.status) })),
  rtoRecord: row.rtoRecord ? { ...row.rtoRecord, rtoStatus: String(row.rtoRecord.rtoStatus), statusLogs: row.rtoRecord.statusLogs.map((log) => ({ ...log, newStatus: String(log.newStatus) })), transferTasks: row.rtoRecord.transferTasks.map((task) => ({ ...task, status: String(task.status) })) } : null,
  listing: row.listing ? { brandName: row.listing.brand.name, modelName: row.listing.model.name } : null,
});

export const getSoldVehicleAnalytics = async (db: AnalyticsDb, args: SoldVehicleAnalyticsArguments = {}) => {
  const parseArgumentDate = (value: string, label: string) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${label} date.`);
    return parsed;
  };
  const to = args.to ? dayEnd(parseArgumentDate(args.to, 'to')) : dayEnd(new Date());
  const days = Math.min(365, Math.max(1, Math.floor(args.days ?? 30)));
  const from = args.from ? dayStart(parseArgumentDate(args.from, 'from')) : new Date(dayStart(to).getTime() - ((days - 1) * DAY_MS));
  if (from > to) throw new Error('The analytics from date cannot be after the to date.');
  const exactDeal = Boolean(args.dealId || args.recordNumber);
  const comparisonFrom = new Date(dayStart(from).getTime() - (daysBetween(from, to) * DAY_MS));
  const where: Prisma.SellAccountWhereInput = {
    deletedAt: null,
    ...(exactDeal
      ? (args.dealId ? { id: args.dealId } : { recordNumber: args.recordNumber! })
      : {
      OR: [
        { sellDate: { gte: comparisonFrom, lte: to } },
        { sellDate: null, completedAt: { gte: comparisonFrom, lte: to } },
        { sellDate: null, completedAt: null, createdAt: { gte: comparisonFrom, lte: to } },
      ],
    }),
  };
  const rows = await db.sellAccount.findMany({ where, orderBy: { createdAt: 'desc' }, take: 1000, select: analyticsSelect });
  const deals = rows.map(toAnalyticsDeal);
  const base = buildSoldVehicleAnalytics({
    deals,
    from,
    to,
    ...(args.metric !== undefined ? { metric: args.metric } : {}),
    ...(args.lowMarginThresholdPercent !== undefined ? { lowMarginThresholdPercent: args.lowMarginThresholdPercent } : {}),
    ...(args.limit !== undefined ? { limit: args.limit } : {}),
    exactDeal,
  });
  if (args.metric === 'forecast') {
    return {
      ...base,
      forecast: buildSoldVehicleForecast({ deals, from, to, ...(args.horizon !== undefined ? { horizonDays: args.horizon } : {}) }),
    };
  }
  return base;
};
