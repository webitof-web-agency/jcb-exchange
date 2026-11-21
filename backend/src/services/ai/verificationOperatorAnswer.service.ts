type VerificationOperatorAnswerInput = {
  message: string;
  toolName: 'partner.verification.queue' | 'partner.verification.dossier' | string;
  operatorData: Record<string, unknown> | null;
};

const text = (val: unknown): string => (typeof val === 'string' ? val.trim() : '');

const statusBadge = (rawStatus: string | null | undefined): string => {
  const s = String(rawStatus || '').toUpperCase();
  switch (s) {
    case 'APPROVED':
    case 'VERIFIED':
    case 'ACTIVE':
      return '🟢 **Verified / Approved**';
    case 'SUBMITTED':
      return '🟡 **Submitted (New)**';
    case 'UNDER_REVIEW':
      return '🔵 **Under Review**';
    case 'CHANGES_REQUESTED':
      return '🟠 **Changes Requested**';
    case 'REJECTED':
      return '🔴 **Rejected**';
    case 'MISSING':
      return '⚪ **Missing / Pending Upload**';
    case 'UPLOADED':
      return '🟣 **Uploaded (Awaiting Check)**';
    case 'NOT_STARTED':
      return '⚪ **Not Started**';
    case 'ACCOUNT_CREATED':
      return '🟡 **Account Created**';
    case 'PROFILE_COMPLETED':
      return '🔵 **Profile Completed**';
    default:
      return s ? `\`${s}\`` : '—';
  }
};

export const buildVerificationOperatorAnswer = (input: VerificationOperatorAnswerInput): string => {
  const data = input.operatorData;
  if (!data || typeof data !== 'object') {
    return 'Partner verification data is currently not available.';
  }

  // 1. Queue Mode
  if (input.toolName === 'partner.verification.queue') {
    const totalQueue = typeof data.totalQueue === 'number' ? data.totalQueue : 0;
    const submittedCount = typeof data.submittedCount === 'number' ? data.submittedCount : 0;
    const underReviewCount = typeof data.underReviewCount === 'number' ? data.underReviewCount : 0;
    const changesRequestedCount = typeof data.changesRequestedCount === 'number' ? data.changesRequestedCount : 0;
    const showroomCount = typeof data.showroomCount === 'number' ? data.showroomCount : 0;
    const brokerCount = typeof data.brokerCount === 'number' ? data.brokerCount : 0;
    const todayCount = typeof data.todayCount === 'number' ? data.todayCount : 0;
    const oldestPending = data.oldestPending && typeof data.oldestPending === 'object'
      ? (data.oldestPending as Record<string, unknown>)
      : null;
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];

    const lines: string[] = [
      '### 🏢 Partner KYC Verifications Queue (Live Operations Desk)',
      '',
      `> 📊 **Active Queue:** **${totalQueue} Cases Pending Action** (Live database queue; zero 30-day filter)  `,
      `> 🟡 **Submitted (New):** **${submittedCount}** · 🔵 **Under Review:** **${underReviewCount}** · 🟠 **Changes Requested:** **${changesRequestedCount}**  `,
      `> 🏬 **Showrooms:** **${showroomCount}** · 🤝 **Brokers:** **${brokerCount}** · 📅 **Submitted Today:** **${todayCount}**  `,
    ];

    if (oldestPending) {
      const pName = text(oldestPending.businessName) || 'Partner';
      const days = oldestPending.daysWaiting !== undefined ? `${oldestPending.daysWaiting} days ago` : 'Oldest';
      lines.push(`> ⏱️ **Oldest Pending Case:** **${pName}** (${days})`);
    }

    lines.push(
      '',
      '---',
      '',
      '#### 📋 Live Partner Verification Cases:',
      '',
      '| # | Partner / Business | Type | Owner / Signatory | Mobile | City / State | Applied Date | Status | Quick Action |',
      '|---|---|---|---|---|---|---|---|---|'
    );

    if (items.length === 0) {
      lines.push('| — | No pending partner verifications in queue | — | — | — | — | — | — | — |');
    } else {
      items.forEach((item, idx) => {
        const code = text(item.partnerCode) ? `\`${text(item.partnerCode)}\`` : '';
        const bName = text(item.businessName) || 'Unnamed Partner';
        const partnerTitle = code ? `**${bName}**<br>${code}` : `**${bName}**`;
        const type = text(item.partnerType) || 'SHOWROOM';
        const owner = text(item.ownerName) || '—';
        const mob = text(item.mobile) ? `📞 ${text(item.mobile)}` : '—';
        const loc = [text(item.city), text(item.state)].filter(Boolean).join(', ') || '—';
        const applied = text(item.appliedOn) ? text(item.appliedOn).slice(0, 10) : '—';
        const st = statusBadge(text(item.kycStatus));
        const reviewUrl = text(item.reviewUrl);
        const action = reviewUrl ? `[Review KYC Dossier](${reviewUrl})` : '—';

        lines.push(`| ${idx + 1} | ${partnerTitle} | ${type} | ${owner} | ${mob} | ${loc} | ${applied} | ${st} | ${action} |`);
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi specific partner ka complete KYC dossier, 6 documents checklist, reviewer comments ya audit history dekhne ke liye partner ka naam ya code batayein (jaise: "ABC Motors ka KYC status" ya "JCB-PAR-001 ke documents").*'
    );

    return lines.join('\n');
  }

  // 2. Dossier Mode
  if (!data.found) {
    const requested = text(data.requestedQuery) || 'partner';
    return `Kshama karein, "${requested}" ke liye koi active partner verification record nahi mila. Kripya partner code (jaise JCB-PAR-001), business name, owner name, mobile number ya email verify karein.`;
  }

  const bName = text(data.businessName) || 'Partner';
  const pCode = text(data.partnerCode) || '';
  const pType = text(data.partnerType) || 'SHOWROOM';
  const partnerId = text(data.partnerId);

  const contact = data.contact && typeof data.contact === 'object' ? (data.contact as Record<string, unknown>) : {};
  const ownerName = text(data.ownerName) || '—';
  const mobile = text(contact.mobile) || '—';
  const whatsapp = text(contact.whatsappNumber) || mobile;
  const email = text(contact.email) || '—';

  const location = data.location && typeof data.location === 'object' ? (data.location as Record<string, unknown>) : {};
  const address = text(location.businessAddress) || '—';
  const district = text(location.district) || '—';
  const city = text(location.city) || '—';
  const state = text(location.state) || '—';
  const pinCode = text(location.pinCode) || '—';
  const fullLoc = [address, district, `${city}, ${state} ${pinCode}`.trim()].filter((part) => part && part !== '—').join(' · ') || '—';

  const biz = data.businessDetails && typeof data.businessDetails === 'object' ? (data.businessDetails as Record<string, unknown>) : {};
  const gstNumber = text(biz.gstNumber) || 'Not Provided';
  const regNo = text(biz.businessRegistrationNumber) || '—';
  const expYears = biz.yearsInBusiness !== undefined && biz.yearsInBusiness !== null ? `${biz.yearsInBusiness} yrs` : '—';
  const teamSize = biz.teamSize !== undefined && biz.teamSize !== null ? `${biz.teamSize} members` : '—';

  const statusObj = data.status && typeof data.status === 'object' ? (data.status as Record<string, unknown>) : {};
  const kycStatus = text(statusObj.kycStatus) || 'SUBMITTED';
  const onboardingStatus = text(statusObj.onboardingStatus) || 'ACCOUNT_CREATED';
  const accountStatus = text(statusObj.accountStatus) || 'PENDING';
  const appliedDate = text(statusObj.appliedOn) ? text(statusObj.appliedOn).slice(0, 10) : '—';

  const reviewUrl = text(data.reviewUrl) || (partnerId ? `/admin/verifications/${partnerId}` : '');
  const documents = Array.isArray(data.documents) ? (data.documents as Array<Record<string, unknown>>) : [];
  const reviewHistory = Array.isArray(data.reviewHistory) ? (data.reviewHistory as Array<Record<string, unknown>>) : [];
  const agreements = Array.isArray(data.agreements) ? (data.agreements as Array<Record<string, unknown>>) : [];

  const lines: string[] = [
    `### 📋 360° Partner KYC Review Dossier — ${bName} ${pCode ? `(${pCode})` : ''}`,
    '',
    `> 🟢 **KYC Status:** ${statusBadge(kycStatus)} · **Onboarding:** \`${onboardingStatus}\` · **Account:** \`${accountStatus}\`  `,
    `> 🏬 **Partner Type:** \`${pType}\` · **Applied Date:** ${appliedDate} · **Real-Time Data:** Live Database (Zero 30-day filter)  `,
    `> 👤 **Owner / Signatory:** **${ownerName}** · 📞 **${mobile}** (WhatsApp: ${whatsapp}) · ✉️ **${email}**  `,
    `> 📍 **Address:** ${fullLoc}  `,
    `> 🏛️ **Tax & Registration:** GSTIN: \`${gstNumber}\` · Reg No: \`${regNo}\` · Experience: ${expYears} · Team: ${teamSize}`,
    '',
    '---',
    '',
    '#### 📑 1. Dynamic 6-Document KYC Verification Checklist:',
    '',
    '| # | Document Type | Requirement | Status | Reviewer Comment / Issue | Verification State | File Actions |',
    '|---|---|---|---|---|---|---|'
  ];

  if (documents.length === 0) {
    lines.push('| — | No documents uploaded | — | — | — | — | — |');
  } else {
    documents.forEach((doc, idx) => {
      const label = text(doc.label) || text(doc.documentType).replace(/_/g, ' ');
      const isMandatory = Boolean(doc.isMandatory);
      const req = isMandatory ? '🔴 **Mandatory**' : '⚪ Standard';
      const st = statusBadge(text(doc.status));
      const comment = text(doc.reviewComment) ? `*“${text(doc.reviewComment)}”*` : '—';
      const vState = text(doc.verificationStatus) ? `\`${text(doc.verificationStatus)}\`` : '`NOT_STARTED`';
      
      const fileUrl = text(doc.fileUrl);
      const templateUrl = text(doc.templateUrl);
      const actionLinks: string[] = [];
      if (fileUrl) actionLinks.push(`[Preview File](${fileUrl})`);
      if (templateUrl) actionLinks.push(`[Template PDF](${templateUrl})`);
      const actions = actionLinks.length > 0 ? actionLinks.join(' · ') : '—';

      lines.push(`| ${idx + 1} | **${label}** | ${req} | ${st} | ${comment} | ${vState} | ${actions} |`);
    });
  }

  // Section 2: Review Audit Trail & Reviewer Remarks
  lines.push('', '#### 📜 2. Review Audit Trail & Reviewer Remarks:');
  if (reviewHistory.length === 0) {
    lines.push('- *No previous review actions logged yet for this partner.*');
  } else {
    reviewHistory.forEach((r) => {
      const act = text(r.action) || 'REVIEW_NOTE';
      const comm = text(r.comment) ? `“${text(r.comment)}”` : 'No comment recorded';
      const dt = text(r.createdAt) ? new Date(text(r.createdAt)).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      lines.push(`- **${act}** (${dt}): *${comm}*`);
    });
  }

  // Section 3: Accepted Agreements
  lines.push('', '#### 📝 3. Signed Agreements & Policies:');
  if (agreements.length === 0) {
    lines.push('- *No agreements accepted yet.*');
  } else {
    const agList = agreements.map((a) => {
      const aType = text(a.agreementType).replace(/_/g, ' ');
      const v = text(a.version) ? `v${text(a.version)}` : '';
      const dt = text(a.acceptedAt) ? text(a.acceptedAt).slice(0, 10) : '—';
      return `\`${aType}${v ? ` (${v})` : ''}\` (Accepted: ${dt})`;
    }).join(' · ');
    lines.push(`- **Accepted Agreements:** ${agList}`);
  }

  // Section 4: Master Actions
  lines.push(
    '',
    '#### 🚀 4. Master Actions & Quick Links:',
    reviewUrl ? `- 👉 **Open Review Workspace:** [Review & Approve Partner KYC](${reviewUrl})` : '',
    partnerId ? `- ✏️ **Edit Partner Profile:** [Partner Master Profile](/admin/partners/${partnerId})` : '',
    '',
    '---',
    'This answer is based on current live application data with zero masking for authorized internal operations.'
  );

  return lines.filter(Boolean).join('\n');
};
