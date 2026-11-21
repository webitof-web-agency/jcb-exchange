type VerificationOperatorAnswerInput = {
  message: string;
  toolName: 'partner.verification.queue' | 'partner.verification.dossier' | 'partner.statistics' | string;
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

  const normalized = input.message.toLocaleLowerCase('en-IN');
  const asksPhone = /\b(?:phone|mobile|contact|cell|number|no|whatsapp)\b/u.test(normalized);
  const asksOwner = /\b(?:owner|owner\s+name|owner\s+ka\s+naam|malik|malik\s+ka\s+naam|signatory)\b/u.test(normalized);
  const asksAddress = /\b(?:address|location|pata|kahan|where|city|state|territory)\b/u.test(normalized);
  const asksGst = /\b(?:gst|gstin|gst\s+number|tax\s+number)\b/u.test(normalized);
  const asksStock = /\b(?:stock|inventory|kitni\s+gaadi|kitni\s+gadi|fleet|active\s+machines|available)\b/u.test(normalized);
  const asksSold = /\b(?:sold|biki|bika|deals?|purchaser|buyer|khareeddar)\b/u.test(normalized);
  const asksRto = /\b(?:rto|transfer|rc\s+transfer|office|agent|raigarh)\b/u.test(normalized);
  const asksInvoice = /\b(?:invoice|bill|challan|pdf|download|bill\s+of\s+supply)\b/u.test(normalized);

  // 0. Partner Agreements Mode
  if (input.toolName === 'partner.agreements.summary') {
    const total = typeof data.total === 'number' ? data.total : 0;
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    const activeCount = items.filter((it) => String(it.status || '').toUpperCase() === 'ACTIVE').length;
    const reqCount = items.filter((it) => Boolean(it.isRequired)).length;

    const lines: string[] = [
      '### 📝 Partner Agreements & Governance Policies (Live Policy Desk)',
      '',
      `> 📊 **Total Agreement Policies:** **${total}** · 🟢 **Active Policies:** **${activeCount}** · 🔴 **Mandatory:** **${reqCount}**`,
      '',
      '| # | Agreement Title | Type | Version | Applicable Partner Types | Requirement | Status | Total Signed Acceptances | Actions |',
      '|---|---|---|---|---|---|---|---|---|',
    ];

    if (items.length === 0) {
      lines.push('| — | No partner agreement definitions found in database | — | — | — | — | — | — | — |');
    } else {
      items.forEach((item, idx) => {
        const title = text(item.title) || 'Agreement';
        const aType = text(item.agreementType) ? `\`${text(item.agreementType)}\`` : '—';
        const v = text(item.version) ? `v${text(item.version)}` : 'v1.0';
        const types = Array.isArray(item.applicablePartnerTypes) && item.applicablePartnerTypes.length
          ? item.applicablePartnerTypes.join(', ')
          : 'ALL PARTNERS';
        const req = item.isRequired ? '🔴 **Mandatory**' : '⚪ Optional';
        const st = statusBadge(text(item.status));
        const acceptCount = typeof item.totalAcceptances === 'number' ? `${item.totalAcceptances} Signed` : '0 Signed';
        const action = `[View Agreements](/employee/partner-agreements)`;

        lines.push(`| ${idx + 1} | **${title}** | ${aType} | ${v} | ${types} | ${req} | ${st} | ${acceptCount} | ${action} |`);
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi agreement ka full text padhne ke liye "agreement text dikhao" ya "partner agreements content" poochein.*'
    );
    return lines.join('\n');
  }

  // 1. Partner Directory / Statistics Mode
  if (input.toolName === 'partner.statistics') {
    const total = typeof data.total === 'number' ? data.total : 0;
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    const activeCount = items.filter((it) => String(it.accountStatus || '').toUpperCase() === 'ACTIVE').length;
    const pendingReviewCount = items.filter((it) => ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'].includes(String(it.kycStatus || '').toUpperCase())).length;
    const totalInventory = items.reduce((sum, it) => sum + (typeof it.inventoryCount === 'number' ? it.inventoryCount : 0), 0);

    const lines: string[] = [
      '### 🏢 Partner & Dealership Directory (Live Operations Desk)',
      '',
      `> 📊 **Total Partners:** **${total}** · 🟢 **Active Accounts:** **${activeCount}** · 🟡 **Pending Review:** **${pendingReviewCount}** · 🚜 **Live Inventory:** **${totalInventory}**`,
      '',
      '| # | Business & Owner | Partner ID | Contact Details | Type & Territory | KYC Status | Account Status | Live Inventory | Joined Date |',
      '|---|---|---|---|---|---|---|---|---|',
    ];

    if (items.length === 0) {
      lines.push('| — | No registered partners found in database | — | — | — | — | — | — | — |');
    } else {
      items.forEach((item, idx) => {
        const bName = text(item.businessName) || 'Unnamed Partner';
        const owner = text(item.ownerName) || '—';
        const pCode = text(item.partnerCode) ? `\`${text(item.partnerCode)}\`` : '—';
        const mob = text(item.mobile) ? `📞 ${text(item.mobile)}` : '—';
        const eml = text(item.email) ? `<br>✉️ ${text(item.email)}` : '';
        const contactCol = `${mob}${eml}`;
        const pType = text(item.partnerType) || 'Authorized Place';
        const terr = text(item.territory) || '—';
        const typeTerrCol = `**${pType}**<br>${terr}`;
        const kycSt = statusBadge(text(item.kycStatus));
        const accSt = statusBadge(text(item.accountStatus));
        const invCount = typeof item.inventoryCount === 'number' ? item.inventoryCount : 0;
        const joined = text(item.joinedDate) || (text(item.createdAt) ? text(item.createdAt).slice(0, 10) : '—');

        lines.push(`| ${idx + 1} | **${bName}**<br>Owner: ${owner} | ${pCode} | ${contactCol} | ${typeTerrCol} | ${kycSt} | ${accSt} | ${invCount} | ${joined} |`);
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi bhi partner ka complete dossier, biki hui gaadiyan, RTO transfers, aur invoice nikalne ke liye partner ka naam ya ID poochein (jaise: "Satya Earth Movers ka profile" ya "ct-raipur-satya ka detail").*'
    );
    return lines.join('\n');
  }

  // 2. Queue Mode
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
      lines.push(`> ⏳ **Oldest Pending Case:** **${pName}** (${days})`);
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

  // 3. Dossier Mode
  if (!data.found) {
    const requested = text(data.requestedQuery) || 'partner';
    return `Kshama karein, "${requested}" ke liye koi active partner record nahi mila. Kripya partner code (jaise ct-raipur-satya, JCB-PAR-001), business name, owner name ya mobile number verify karein.`;
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
  const inventory = Array.isArray(data.inventory) ? (data.inventory as Array<Record<string, unknown>>) : [];
  const deals = Array.isArray(data.deals) ? (data.deals as Array<Record<string, unknown>>) : [];
  const rtoRecords = Array.isArray(data.rtoRecords) ? (data.rtoRecords as Array<Record<string, unknown>>) : [];

  // Handle narrow question intents directly (ChatGPT-like targeted answers)
  if (asksPhone && !asksOwner && !asksStock && !asksSold && !asksRto && !asksInvoice) {
    return [
      `### 📞 Contact Details for ${bName}`,
      `- **Mobile Number:** 📞 ${mobile}`,
      contact.alternateMobile ? `- **Alternate Mobile:** 📞 ${text(contact.alternateMobile)}` : '',
      `- **WhatsApp:** [Chat on WhatsApp](https://wa.me/91${whatsapp.replace(/[^0-9]/g, '')}) (${whatsapp})`,
      `- **Email Address:** ✉️ ${email}`,
      `- **Location:** ${fullLoc}`,
    ].filter(Boolean).join('\n');
  }

  if (asksOwner && !asksStock && !asksSold && !asksRto && !asksInvoice) {
    return [
      `### 👤 Owner / Signatory Details for ${bName}`,
      `- **Owner Name:** **${ownerName}**`,
      `- **Contact Number:** 📞 ${mobile}`,
      `- **Email:** ✉️ ${email}`,
      `- **Partner Type:** \`${pType}\` · Partner ID: \`${pCode || '—'}\``,
    ].join('\n');
  }

  if (asksAddress && !asksStock && !asksSold && !asksRto && !asksInvoice) {
    return [
      `### 📍 Business Address for ${bName}`,
      `- **Address:** ${fullLoc}`,
      `- **District:** ${district} · **State:** ${state} · **PIN:** ${pinCode}`,
      biz.serviceAreas ? `- **Service Areas:** ${text(biz.serviceAreas)}` : '',
    ].filter(Boolean).join('\n');
  }

  if (asksGst && !asksStock && !asksSold && !asksRto && !asksInvoice) {
    return [
      `### 🏛️ GST & Tax Details for ${bName}`,
      `- **GSTIN Number:** \`${gstNumber}\``,
      `- **Registration No:** \`${regNo}\``,
      `- **KYC Verification Status:** ${statusBadge(kycStatus)}`,
    ].join('\n');
  }

  if (asksStock && !asksSold && !asksRto) {
    if (inventory.length === 0) {
      return `### 🚜 Live Stock & Inventory — ${bName}\n\nAbhi **${bName}** ke account me koi active ya published vehicle inventory available nahi hai. (Total published machines: 0).`;
    }
    const invLines = inventory.map((item, idx) => {
      const reg = text(item.registrationNumber) || 'Unassigned';
      const title = text(item.title) || `${text(item.brand)} ${text(item.model)}`;
      const price = typeof item.price === 'number' ? `₹${item.price.toLocaleString('en-IN')}` : 'Price on request';
      const hours = item.hours ? `${item.hours} hrs` : 'N/A';
      const url = text(item.listingUrl) ? ` · [View Listing](${text(item.listingUrl)})` : '';
      return `${idx + 1}. **${title}** (${reg}) — ${price} · ${hours} · Status: \`${text(item.status)}\`${url}`;
    });
    return `### 🚜 Live Stock & Inventory — ${bName} (${inventory.length} Machines)\n\n${invLines.join('\n')}`;
  }

  if (asksSold && !asksStock && !asksRto) {
    if (deals.length === 0) {
      return `### 🤝 Deals & Sold Vehicles — ${bName}\n\nAbhi **${bName}** ke name par koi finalized sale deal record nahi mila.`;
    }
    const dealLines = deals.map((d, idx) => {
      const rec = text(d.recordNumber) || `Deal #${idx + 1}`;
      const veh = text(d.vehicleNumber) || 'Vehicle';
      const buyer = text(d.purchaserName) || 'Buyer';
      const buyerPhone = text(d.purchaserPhone) ? ` (📞 ${text(d.purchaserPhone)})` : '';
      const amt = typeof d.sellAmount === 'number' ? `₹${d.sellAmount.toLocaleString('en-IN')}` : '—';
      const invNo = text(d.invoiceNumber);
      const invLink = text(d.invoicePdfUrl) ? ` · [📄 Download Bill of Supply PDF](${text(d.invoicePdfUrl)})` : '';
      return `${idx + 1}. **${veh}** (${rec}) — Sold to **${buyer}**${buyerPhone} for **${amt}** · Status: \`${text(d.dealStatus)}\`${invNo ? ` · Invoice: \`${invNo}\`` : ''}${invLink}`;
    });
    return `### 🤝 Biki Hui Gaadiyan (Sold Deals) — ${bName} (${deals.length} Deals)\n\n${dealLines.join('\n')}`;
  }

  if (asksRto && !asksStock && !asksSold) {
    if (rtoRecords.length === 0) {
      return `### 🏛️ Connected RTO Transfers — ${bName}\n\nAbhi **${bName}** ke name par koi linked RTO transfer case record nahi mila.`;
    }
    const rtoLines = rtoRecords.map((r, idx) => {
      const veh = text(r.vehicleNumber) || 'Vehicle';
      const off = text(r.rtoOffice) || 'DTO';
      const st = text(r.status) || 'PENDING';
      const ag = text(r.rtoAgentName) ? `Agent: ${text(r.rtoAgentName)} (${text(r.rtoAgentPhone) || 'No phone'})` : 'Agent: Not Assigned';
      const locked = r.isLocked ? '🔒 Locked (Deal Done)' : '🔓 Open';
      const url = text(r.rtoWorkUrl) ? ` · [🔍 Open RTO Work Details](${text(r.rtoWorkUrl)})` : '';
      return `${idx + 1}. **${veh}** (${off}) — Status: \`${st}\` · ${ag} · ${locked}${url}`;
    });
    return `### 🏛️ Connected RTO Transfers — ${bName} (${rtoRecords.length} Cases)\n\n${rtoLines.join('\n')}`;
  }

  // Full 360-Degree Partner Dossier
  const lines: string[] = [
    `### 📋 360° Partner KYC Review Dossier — ${bName} ${pCode ? `(${pCode})` : ''}`,
    '',
    `> 🟢 **KYC Status:** ${statusBadge(kycStatus)} · **Onboarding:** \`${onboardingStatus}\` · **Account:** \`${accountStatus}\`  `,
    `> 🏬 **Partner Type:** \`${pType}\` · **Applied Date:** ${appliedDate} · **Real-Time Data:** Live Database (Zero Masking)  `,
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

  // Section 4: Live Inventory & Fleet
  lines.push('', `#### 🚜 4. Live Inventory & Fleet (${inventory.length} Published Machines):`);
  if (inventory.length === 0) {
    lines.push('- *Currently 0 active inventory machines listed by this partner.*');
  } else {
    inventory.forEach((item, idx) => {
      const reg = text(item.registrationNumber) || 'Unassigned';
      const title = text(item.title) || `${text(item.brand)} ${text(item.model)}`;
      const price = typeof item.price === 'number' ? `₹${item.price.toLocaleString('en-IN')}` : '—';
      const hours = item.hours ? `${item.hours} hrs` : 'N/A';
      const url = text(item.listingUrl) ? `[View Listing](${text(item.listingUrl)})` : '—';
      lines.push(`- **${idx + 1}. ${title}** (${reg}): Price: **${price}** · Hours: ${hours} · Status: \`${text(item.status)}\` · ${url}`);
    });
  }

  // Section 5: Deals & Sold Vehicles
  lines.push('', `#### 🤝 5. Deals & Sold Vehicles (${deals.length} Finalized Deals):`);
  if (deals.length === 0) {
    lines.push('- *No sold vehicle deals recorded for this partner.*');
  } else {
    deals.forEach((d, idx) => {
      const rec = text(d.recordNumber) || `Deal #${idx + 1}`;
      const veh = text(d.vehicleNumber) || 'Vehicle';
      const buyer = text(d.purchaserName) || 'Buyer';
      const buyerPhone = text(d.purchaserPhone) ? `(📞 ${text(d.purchaserPhone)})` : '';
      const amt = typeof d.sellAmount === 'number' ? `₹${d.sellAmount.toLocaleString('en-IN')}` : '—';
      const invNo = text(d.invoiceNumber) || 'Pending';
      const invLink = text(d.invoicePdfUrl) ? `[📄 Download Invoice PDF](${text(d.invoicePdfUrl)})` : '—';
      const challanLink = text(d.deliveryChallanUrl) ? `[📦 Delivery Challan](${text(d.deliveryChallanUrl)})` : '—';
      lines.push(`- **${idx + 1}. ${veh}** (${rec}): Sold to **${buyer}** ${buyerPhone} for **${amt}** · Invoice No: \`${invNo}\` · Actions: ${invLink} · ${challanLink}`);
    });
  }

  // Section 6: Connected RTO Work & Transfers
  lines.push('', `#### 🏛️ 6. Connected RTO Work & Transfer Pipeline (${rtoRecords.length} Transfer Cases):`);
  if (rtoRecords.length === 0) {
    lines.push('- *No RTO transfer records connected to this partner.*');
  } else {
    rtoRecords.forEach((r, idx) => {
      const veh = text(r.vehicleNumber) || 'Vehicle';
      const off = text(r.rtoOffice) || 'DTO';
      const st = text(r.status) || 'PENDING';
      const ag = text(r.rtoAgentName) ? `${text(r.rtoAgentName)} (📞 ${text(r.rtoAgentPhone) || '—'})` : 'Not Assigned';
      const locked = r.isLocked ? '🔒 Locked' : '🔓 In Progress';
      const rtoLink = text(r.rtoWorkUrl) ? `[🔍 Open RTO Work Details](${text(r.rtoWorkUrl)})` : '—';
      lines.push(`- **${idx + 1}. ${veh}** (${off}): Phase: \`${st}\` · Agent: **${ag}** · Status: ${locked} · Action: ${rtoLink}`);
    });
  }

  // Section 7: Direct Document & Download Links
  lines.push('', '#### 📄 7. Direct Document & PDF Downloads:');
  const docActionLinks: string[] = [];
  deals.forEach((d) => {
    if (text(d.invoicePdfUrl)) docActionLinks.push(`- [📄 Download Bill of Supply (${text(d.vehicleNumber)} / ${text(d.invoiceNumber)})](${text(d.invoicePdfUrl)})`);
    if (text(d.deliveryChallanUrl)) docActionLinks.push(`- [📦 Download Delivery Challan (${text(d.vehicleNumber)})](${text(d.deliveryChallanUrl)})`);
  });
  documents.forEach((doc) => {
    if (text(doc.fileUrl)) {
      docActionLinks.push(`- [🔍 View ${text(doc.label) || text(doc.documentType)}](${text(doc.fileUrl)})`);
    }
  });
  if (docActionLinks.length === 0) {
    lines.push('- *No downloadable documents or PDFs uploaded yet.*');
  } else {
    lines.push(...docActionLinks);
  }

  // Section 8: Master Actions
  lines.push(
    '',
    '#### 🚀 8. Master Actions & Quick Links:',
    reviewUrl ? `- 👉 **Open Review Workspace:** [Review & Approve Partner KYC](${reviewUrl})` : '',
    partnerId ? `- ✏️ **Edit Partner Profile:** [Partner Master Profile](/employee/partners)` : '',
    '',
    '---',
    'This answer is based on current live application data with zero masking for authorized internal operations.'
  );

  return lines.filter(Boolean).join('\n');
};
