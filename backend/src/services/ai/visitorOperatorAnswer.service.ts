type VisitorOperatorAnswerInput = {
  message: string;
  toolName: 'customer.summary' | 'customer.detail' | 'crm.won.customers.summary' | 'crm.contact.detail' | string;
  operatorData: Record<string, unknown> | null;
};

const text = (val: unknown): string => (typeof val === 'string' ? val.trim() : '');

const currency = (val: unknown): string => {
  const num = typeof val === 'number' ? val : (typeof val === 'string' ? Number(val) : NaN);
  if (Number.isNaN(num) || num === 0) return '₹0';
  return `₹${num.toLocaleString('en-IN')}`;
};

const statusBadge = (rawStatus: string | null | undefined): string => {
  const s = String(rawStatus || '').toUpperCase();
  switch (s) {
    case 'ACTIVE':
    case 'WON':
    case 'COMPLETED':
    case 'APPROVED':
    case 'VERIFIED':
    case 'DEAL_DONE':
      return '🟢 **Active**';
    case 'INACTIVE':
    case 'CLOSED':
    case 'REJECTED':
    case 'LOST':
      return '🔴 **Inactive**';
    case 'PENDING':
    case 'UNDER_REVIEW':
    case 'SUBMITTED':
    case 'UNDER_PROCESS':
      return '🟡 **Pending**';
    case 'CHANGES_REQUESTED':
      return '🟠 **Changes Requested**';
    case 'PRIME':
      return '👑 **Prime**';
    default:
      return s ? `\`${s}\`` : '—';
  }
};

const extractGoogleDriveLinks = (...sources: unknown[]): string[] => {
  const links: string[] = [];
  const regex = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s"')\]]+/gi;

  const inspect = (val: unknown) => {
    if (!val) return;
    if (typeof val === 'string') {
      const found = val.match(regex);
      if (found) links.push(...found);
    } else if (Array.isArray(val)) {
      val.forEach(inspect);
    } else if (typeof val === 'object') {
      for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
        if (key.toLowerCase().includes('drive') && typeof v === 'string' && v.startsWith('http')) {
          links.push(v);
        } else {
          inspect(v);
        }
      }
    }
  };

  sources.forEach(inspect);
  return [...new Set(links)];
};

export const buildVisitorOperatorAnswer = (input: VisitorOperatorAnswerInput): string => {
  const data = input.operatorData;
  if (!data || typeof data !== 'object') {
    return 'Visitor & customer directory data is currently not available.';
  }

  const normalized = input.message.toLocaleLowerCase('en-IN');
  const asksPhone = /\b(?:phone|mobile|contact|cell|number|no|whatsapp)\b/u.test(normalized);
  const asksActivity = /\b(?:dekha|dekhi|view|views|viewed|search|searches|searched|website|portal|activity|intent|interested|machines?)\b/u.test(normalized);
  const asksInvoice = /\b(?:invoice|bill|challan|bill\s+of\s+supply|pdf|download|deed)\b/u.test(normalized);
  const asksReceipt = /\b(?:receipt|slip|payment\s+proof|advance|proof|challan\s+slip)\b/u.test(normalized);
  const asksDeals = /\b(?:deal|deals|sold|purchase|khareeddar|biki|amount|profit|margin)\b/u.test(normalized);
  const asksRto = /\b(?:rto|transfer|rc\s+transfer|office|agent)\b/u.test(normalized);

  // 1. Won Customers Summary Mode
  if (input.toolName === 'crm.won.customers.summary' || data.module === 'won-customers') {
    const total = typeof data.total === 'number' ? data.total : 0;
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];
    const activeCount = typeof data.activeAccounts === 'number' ? data.activeAccounts : items.filter((it) => String(it.status || '').toUpperCase() === 'ACTIVE').length;
    const primeCount = typeof data.primeCustomers === 'number' ? data.primeCustomers : items.filter((it) => Boolean(it.isPrimeCustomer)).length;
    const wonLeadTotal = typeof data.wonLeadTotal === 'number' ? data.wonLeadTotal : items.reduce((sum, it) => sum + (typeof it.leadCount === 'number' ? it.leadCount : 0), 0);
    const totalWonAmount = items.reduce((sum, it) => sum + (typeof it.wonAmount === 'number' ? it.wonAmount : (typeof it.dealAmount === 'number' ? it.dealAmount : 0)), 0);

    const amountLabel = totalWonAmount > 0 ? ` · 💰 **Closed Deal Volume:** **${currency(totalWonAmount)}**` : '';

    const lines: string[] = [
      '### 🏆 Won Customers Directory (Closed Won Deals & Deal Amounts)',
      '',
      `> 📊 **Total Won Customers:** **${total}** · 🟢 **Active Accounts:** **${activeCount}** · 👑 **Prime Customers:** **${primeCount}** · 🎯 **Won Leads:** **${wonLeadTotal}**${amountLabel}`,
      '',
      '| # | Customer Name | Direct Contact Actions | City / State | Company | Won Leads | Deal Amount | Status | Actions |',
      '|---|---|---|---|---|---|---|---|---|',
    ];

    if (items.length === 0) {
      lines.push('| — | No won customers found in database | — | — | — | — | — | — | — |');
    } else {
      items.forEach((item, idx) => {
        const cName = text(item.customerName) || 'Unnamed Customer';
        const rawMob = text(item.mobile);
        const cleanDigits = rawMob.replace(/\D/g, '').slice(-10);
        const contactCol = cleanDigits
          ? `[📞 ${cleanDigits}](tel:${cleanDigits})<br>[💬 WhatsApp](https://wa.me/91${cleanDigits})`
          : '—';
        const city = text(item.city);
        const state = text(item.state);
        const loc = [city, state].filter(Boolean).join(', ') || '—';
        const comp = text(item.companyName) || '—';
        const leadCount = typeof item.leadCount === 'number' ? `${item.leadCount} Won` : '1 Won';
        const dealAmt = typeof item.dealAmount === 'number'
          ? currency(item.dealAmount)
          : (typeof item.wonAmount === 'number' ? currency(item.wonAmount) : (typeof item.sellAmount === 'number' ? currency(item.sellAmount) : '—'));
        const st = statusBadge(text(item.status || item.pipelineStage || 'WON'));
        const profBtn = text(item.contactId || item.customerId) ? `[Profile](/employee/visitors/${text(item.contactId || item.customerId)})` : '';

        lines.push(`| ${idx + 1} | **${cName}** | ${contactCol} | ${loc} | ${comp} | ${leadCount} | **${dealAmt}** | ${st} | ${profBtn} |`);
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi specific won customer ke deals, Bill of Supply PDF invoice, payment slips ya RTO records dekhne ke liye poochein (jaise: "test0 ka invoice ya bill nikaal ke do" ya "test0 ki payment receipt dikhao").*'
    );
    return lines.join('\n');
  }

  // 2. Visitor & Customer Directory Summary Mode
  if (input.toolName === 'customer.summary') {
    const total = typeof data.total === 'number' ? data.total : 0;
    const active = typeof data.active === 'number' ? data.active : 0;
    const primeCount = typeof data.primeCount === 'number' ? data.primeCount : 0;
    const citiesCovered = typeof data.citiesCovered === 'number' ? data.citiesCovered : 0;
    const items = Array.isArray(data.items) ? (data.items as Array<Record<string, unknown>>) : [];

    const lines: string[] = [
      '### 👥 Visitor & Customer Directory (Live Operations Desk)',
      '',
      `> 📊 **Registered Visitors:** **${total}** · 🟢 **Active Accounts:** **${active}** · 👑 **Prime Customers:** **${primeCount}** · 📍 **Cities Covered:** **${citiesCovered}**`,
      '',
      '| # | Visitor | Contact & Direct Actions | Location | Source | Account Status | Joined Date | Direct Operations |',
      '|---|---|---|---|---|---|---|---|',
    ];

    if (items.length === 0) {
      lines.push('| — | No registered visitors found in database | — | — | — | — | — | — |');
    } else {
      items.forEach((item, idx) => {
        const vName = text(item.customerName) || 'Visitor';
        const roleDesc = item.isPrimeCustomer ? '👑 Prime Customer' : 'Customer';
        const nameCol = `**${vName}**<br><small style="color:gray">${roleDesc}</small>`;
        const rawMob = text(item.mobile);
        const cleanDigits = rawMob.replace(/\D/g, '').slice(-10);
        const contactLinks = cleanDigits
          ? `[📞 ${cleanDigits}](tel:${cleanDigits}) · [💬 WhatsApp](https://wa.me/91${cleanDigits})`
          : '—';
        const eml = text(item.email) ? `<br><small>✉️ ${text(item.email)}</small>` : '';
        const contactCol = `${contactLinks}${eml}`;
        const city = text(item.city);
        const state = text(item.state);
        const loc = [city, state].filter(Boolean).join(', ') || '—';
        const src = text(item.source) || (text(item.authProvider) === 'LOCAL' ? 'Self registered' : text(item.authProvider) || 'Self registered');
        const st = statusBadge(text(item.status || 'ACTIVE'));
        const joined = text(item.createdAt) ? text(item.createdAt).slice(0, 10) : '—';
        const profBtn = text(item.customerId) ? `[👤 Visitor 360°](/employee/visitors/${text(item.customerId)})` : '—';

        lines.push(`| ${idx + 1} | ${nameCol} | ${contactCol} | ${loc} | ${src} | ${st} | ${joined} | ${profBtn} |`);
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi bhi visitor ka mobile number, website activity, dekhi hui gaadiyan, deals ya invoice dekhne ke liye seedhe poochein (jaise: "test0 ka mobile number kya hai?" ya "test0 ne website par kya kya dekha hai?").*'
    );
    return lines.join('\n');
  }

  // 3. Customer 360° Detail Mode
  const customer = (data.customer || data.contact || {}) as Record<string, unknown>;
  const cName = text(customer.customerName) || text(customer.name) || 'Customer';
  const mobile = text(customer.mobile) || '—';
  const whatsapp = text(customer.whatsappNumber) || mobile;
  const email = text(customer.email);
  const city = text(customer.city);
  const state = text(customer.state);
  const location = [city, state].filter(Boolean).join(', ') || '—';
  const cleanDigits = mobile.replace(/\D/g, '').slice(-10);
  const waDigits = whatsapp.replace(/\D/g, '').slice(-10) || cleanDigits;
  const profileUrl = text(customer.profileUrl) || (text(customer.customerId || customer.id) ? `/employee/visitors/${text(customer.customerId || customer.id)}` : '/employee/visitors');

  const intent = (data.digitalIntent || {}) as Record<string, unknown>;
  const viewedListings = Array.isArray(intent.viewedListings) ? (intent.viewedListings as Array<Record<string, unknown>>) : [];
  const searches = Array.isArray(intent.searches) ? (intent.searches as string[]).filter(Boolean) : [];
  const deals = Array.isArray(data.deals) ? (data.deals as Array<Record<string, unknown>>) : [];
  const rtoRecords = Array.isArray(data.rtoRecords || data.rto) ? ((data.rtoRecords || data.rto) as Array<Record<string, unknown>>) : [];
  const invoices = Array.isArray(data.invoices) ? (data.invoices as Array<Record<string, unknown>>) : [];
  const receipts = Array.isArray(data.receipts || data.payments) ? ((data.receipts || data.payments) as Array<Record<string, unknown>>) : [];
  const leads = Array.isArray(data.leads) ? (data.leads as Array<Record<string, unknown>>) : [];

  // Detect Google Drive links stored in CRM profile notes, documents, or custom fields
  const driveLinks = extractGoogleDriveLinks(
    (customer.crmProfile as any)?.notes,
    data.crmProfile,
    data.notes,
    deals.map((d) => d.notes),
    data.documents
  );
  const driveLinkFormatted = driveLinks.length > 0 ? `[📁 Google Drive Folder](${driveLinks[0]})` : '';

  // 3A. Narrow Intent: Phone / Contact / WhatsApp
  if (asksPhone && !asksActivity && !asksInvoice && !asksReceipt && !asksDeals && !asksRto) {
    return [
      `### 📱 Contact Details: **${cName}**`,
      '',
      `- **Customer Name:** **${cName}**`,
      `- **Mobile Number:** \`${mobile}\``,
      `- **WhatsApp Number:** \`${whatsapp}\``,
      email ? `- **Email ID:** \`${email}\`` : '- **Email ID:** Not registered',
      `- **Location:** ${location}`,
      `- **Account Status:** ${statusBadge(text(customer.status || 'ACTIVE'))}`,
      customer.isPrimeCustomer ? '- **Membership:** 👑 **Prime Customer**' : '- **Membership:** Standard Visitor',
      driveLinkFormatted ? `- **Cloud Documents:** ${driveLinkFormatted}` : '',
      '',
      '#### ⚡ One-Click Direct Actions:',
      cleanDigits ? `- 📞 **Direct Call:** [📞 ${cleanDigits}](tel:${cleanDigits})` : '',
      waDigits ? `- 💬 **WhatsApp Chat:** [💬 WhatsApp](https://wa.me/91${waDigits})` : '',
      driveLinkFormatted ? `- 📁 **Google Drive Documents:** ${driveLinkFormatted}` : '',
      `- 👤 **Full Visitor Dossier:** [Open Visitor Profile](${profileUrl})`,
      '',
      '---',
      '💡 *Tip: Inki website activity dekhne ke liye poochein: "test0 ne website par kya kya dekha hai?".*'
    ].filter(Boolean).join('\n');
  }

  // 3B. Buyer Intent: Website Activity & Viewed Machines
  if (asksActivity && !asksPhone && !asksInvoice && !asksReceipt) {
    const totalViews = typeof intent.totalViews === 'number' ? intent.totalViews : viewedListings.length;
    const contactClicks = typeof intent.totalContactClicks === 'number' ? intent.totalContactClicks : 0;

    const lines: string[] = [
      `### 🔍 Buyer Digital Intent & Website Activity: **${cName}**`,
      '',
      `> 📈 **Total Machine Views:** **${totalViews}** · 📞 **Contact Dealer Clicks:** **${contactClicks}** · 🔎 **Searches Performed:** **${searches.length}**`,
      '',
    ];

    if (searches.length > 0) {
      lines.push('#### 🔎 Search Queries on Portal:');
      searches.slice(0, 8).forEach((q) => {
        lines.push(`- \`${q}\``);
      });
      lines.push('');
    }

    lines.push('#### 🚜 Viewed Machines & Equipment:');
    if (viewedListings.length === 0) {
      lines.push('- *Is visitor ne abhi tak kisi machine ka product page view nahi kiya hai.*');
    } else {
      lines.push(
        '| # | Machine Title | Price | Location | Status | Action |',
        '|---|---|---|---|---|---|'
      );
      viewedListings.forEach((m, idx) => {
        const title = text(m.title) || 'Equipment';
        const prc = currency(m.price);
        const loc = [text(m.city), text(m.state)].filter(Boolean).join(', ') || '—';
        const st = statusBadge(text(m.status || 'AVAILABLE'));
        const link = text(m.listingUrl) || (text(m.id) ? `/employee/listings/${text(m.id)}` : '#');
        const photo = text(m.imageUrl) ? ` · [🖼️ Photo](${text(m.imageUrl)})` : '';
        lines.push(`| ${idx + 1} | **${title}** | **${prc}** | ${loc} | ${st} | [View Machine](${link})${photo} |`);
      });
    }

    lines.push(
      '',
      '#### ⚡ Direct Actions:',
      cleanDigits ? `- [📞 ${cleanDigits}](tel:${cleanDigits}) · [💬 WhatsApp](https://wa.me/91${waDigits})` : '',
      driveLinkFormatted ? `- ${driveLinkFormatted}` : '',
      `- 👤 [Open Visitor 360° Profile](${profileUrl})`
    );
    return lines.filter(Boolean).join('\n');
  }

  // 3C. Invoice & Bill Intent
  if (asksInvoice) {
    const lines: string[] = [
      `### 📄 Invoices & Delivery Challans: **${cName}**`,
      '',
    ];

    if (invoices.length === 0 && deals.length === 0) {
      lines.push(
        `> ℹ️ **${cName}** ke naam par abhi koi active vehicle sale invoice ya delivery challan generate nahi hua hai.`,
        '',
        `- **Customer Mobile:** \`${mobile}\``,
        cleanDigits ? `- **Direct Actions:** [📞 ${cleanDigits}](tel:${cleanDigits}) · [💬 WhatsApp](https://wa.me/91${waDigits})` : '',
        driveLinkFormatted ? `- **Documents:** ${driveLinkFormatted}` : '',
        `- **Profile:** [Open Visitor Profile](${profileUrl})`
      );
    } else {
      lines.push(
        '| # | Record No | Vehicle Number | Deal Amount | Deal Status | Bill of Supply (Invoice PDF) | Delivery Challan |',
        '|---|---|---|---|---|---|---|'
      );
      const rows = invoices.length ? invoices : deals;
      rows.forEach((inv, idx) => {
        const rec = text(inv.recordNumber) ? `#${text(inv.recordNumber)}` : '—';
        const veh = text(inv.vehicleNumber) ? `\`${text(inv.vehicleNumber)}\`` : '—';
        const dealAmt = inv.sellAmount ? currency(inv.sellAmount) : (inv.amount ? currency(inv.amount) : '—');
        const st = statusBadge(text(inv.dealStatus || 'WON'));
        const invUrl = text(inv.invoiceUrl || (text(inv.id) ? `/api/recruitment/admin/sell-accounts/${text(inv.id)}/invoice` : ''));
        const chUrl = text(inv.challanUrl || (text(inv.id) ? `/api/recruitment/admin/sell-accounts/${text(inv.id)}/delivery-challan` : ''));
        const invLink = invUrl ? `[📄 Download Bill of Supply PDF](${invUrl})` : '—';
        const chLink = chUrl ? `[📄 Download Delivery Challan](${chUrl})` : '—';
        lines.push(`| ${idx + 1} | ${rec} | ${veh} | **${dealAmt}** | ${st} | ${invLink} | ${chLink} |`);
      });
    }

    if (driveLinkFormatted) {
      lines.push('', `> 📁 **Attached Cloud Folder:** ${driveLinkFormatted}`);
    }

    return lines.filter(Boolean).join('\n');
  }

  // 3D. Payment Receipt Intent
  if (asksReceipt) {
    const lines: string[] = [
      `### 🧾 Payment Receipts & Slips: **${cName}**`,
      '',
    ];

    if (receipts.length === 0) {
      lines.push(
        `> ℹ️ **${cName}** ke account me koi uploaded payment slip ya receipt proof record nahi mila.`,
        '',
        cleanDigits ? `- **Customer Contact:** [📞 ${cleanDigits}](tel:${cleanDigits}) · [💬 WhatsApp](https://wa.me/91${waDigits})` : '',
        driveLinkFormatted ? `- **Cloud Documents:** ${driveLinkFormatted}` : '',
        `- **Visitor Profile:** [Open Profile](${profileUrl})`
      );
    } else {
      lines.push(
        '| # | Payment Type | Amount | Ref / UTR | Submission Date | Payment Receipt Image |',
        '|---|---|---|---|---|---|'
      );
      receipts.forEach((rcpt, idx) => {
        const pType = text(rcpt.type || rcpt.method) || 'Listing Advance';
        const amt = currency(rcpt.amount);
        const ref = text(rcpt.transactionRef) ? `\`${text(rcpt.transactionRef)}\`` : '—';
        const subDate = text(rcpt.submittedAt) ? text(rcpt.submittedAt).slice(0, 10) : '—';
        const rUrl = text(rcpt.receiptUrl);
        const rLink = rUrl ? `[🧾 View Payment Receipt Image](${rUrl})` : '—';
        lines.push(`| ${idx + 1} | **${pType}** | **${amt}** | ${ref} | ${subDate} | ${rLink} |`);
      });
    }

    return lines.filter(Boolean).join('\n');
  }

  // 3E. Complete 360° Visitor Dossier (ChatGPT Style)
  const lines: string[] = [
    `### 👤 Visitor & Customer 360° Dossier: **${cName}**`,
    '',
    `> 📊 **Account Status:** ${statusBadge(text(customer.status || 'ACTIVE'))} · **Role:** ${customer.isPrimeCustomer ? '👑 **Prime Customer**' : 'Customer'} · **Registered:** ${text(customer.createdAt).slice(0, 10) || '—'}`,
    '',
    '#### 1. 📱 Contact & Profile Information',
    `- **Full Name:** **${cName}**`,
    `- **Mobile Number:** \`${mobile}\` ${cleanDigits ? `([📞 ${cleanDigits}](tel:${cleanDigits}) · [💬 WhatsApp](https://wa.me/91${waDigits}))` : ''}`,
    `- **WhatsApp Number:** \`${whatsapp}\``,
    email ? `- **Email ID:** \`${email}\`` : '- **Email ID:** Not provided',
    `- **Location / Address:** ${location}`,
    `- **Auth Provider:** \`${text(customer.authProvider) || 'LOCAL'}\``,
    `- **CRM Lifecycle:** \`${text((customer.crmProfile as any)?.lifecycle) || 'Customer'}\``,
    driveLinkFormatted ? `- **Cloud Documents Folder:** ${driveLinkFormatted}` : '',
    '',
    '#### 2. 🔍 Digital Intent & Machine Searches',
    `- **Total Machine Views:** **${typeof intent.totalViews === 'number' ? intent.totalViews : viewedListings.length}**`,
    `- **Contact Dealer Clicks:** **${typeof intent.totalContactClicks === 'number' ? intent.totalContactClicks : 0}**`,
    searches.length > 0 ? `- **Recent Searches:** ${searches.slice(0, 5).map((q) => `\`${q}\``).join(', ')}` : '- **Recent Searches:** No search history recorded yet',
  ];

  if (viewedListings.length > 0) {
    lines.push('', '##### 🚜 Viewed Machines:');
    viewedListings.slice(0, 5).forEach((m) => {
      lines.push(`- **${text(m.title)}** (${currency(m.price)}) · [View Listing](${text(m.listingUrl)})${text(m.imageUrl) ? ` · [🖼️ Photo](${text(m.imageUrl)})` : ''}`);
    });
  }

  lines.push('', '#### 3. 🎯 CRM Leads & Inquiries');
  if (leads.length === 0) {
    lines.push('- No direct CRM leads attached.');
  } else {
    leads.slice(0, 5).forEach((ld) => {
      const expAmt = ld.expectedValue ? ` · Expected: **${currency(ld.expectedValue)}**` : (ld.wonAmount ? ` · Won Amount: **${currency(ld.wonAmount)}**` : '');
      lines.push(`- **Lead #${text(ld.id).slice(0, 8)}:** Stage \`${text(ld.stage || ld.status)}\`${expAmt} · Created ${text(ld.createdAt).slice(0, 10)}`);
    });
  }

  lines.push('', '#### 4. 🤝 Closed Deals, Deal Amounts & Invoices');
  if (deals.length === 0 && invoices.length === 0) {
    lines.push('- No closed vehicle sale deals on record.');
  } else {
    const dealRows = deals.length ? deals : invoices;
    dealRows.slice(0, 5).forEach((d) => {
      const vNum = text(d.vehicleNumber) ? `(${text(d.vehicleNumber)})` : '';
      const rec = text(d.recordNumber) ? `#${text(d.recordNumber)}` : '';
      const sAmt = d.sellAmount ? ` · Deal Amount: **${currency(d.sellAmount)}**` : '';
      const pAmt = d.purchaseAmount ? ` (Cost: ${currency(d.purchaseAmount)})` : '';
      const profit = d.netProfit !== undefined && d.netProfit !== null ? ` · Net Margin: **${currency(d.netProfit)}**` : '';
      const invUrl = text(d.invoiceUrl || `/api/recruitment/admin/sell-accounts/${d.id}/invoice`);
      const invLink = invUrl ? ` · [📄 Download Bill of Supply PDF](${invUrl})` : '';
      const chUrl = text(d.challanUrl || `/api/recruitment/admin/sell-accounts/${d.id}/delivery-challan`);
      const chLink = chUrl ? ` · [📄 Download Delivery Challan](${chUrl})` : '';
      lines.push(`- **Deal ${rec} ${vNum}:** Status \`${text(d.dealStatus || 'WON')}\`${sAmt}${pAmt}${profit}${invLink}${chLink}`);
    });
  }

  lines.push('', '#### 5. 🏛️ RTO Transfer Records');
  if (rtoRecords.length === 0) {
    lines.push('- No RTO compliance transfer cases linked.');
  } else {
    rtoRecords.slice(0, 5).forEach((r) => {
      const vNum = text(r.vehicleNumber);
      const st = text(r.rtoStatus || 'UNDER_PROCESS');
      const off = text(r.rtoOffice) ? ` at ${text(r.rtoOffice)}` : '';
      const rUrl = text(r.rtoWorkUrl || `/employee/accounts/rto-work-status/${encodeURIComponent(vNum)}`);
      lines.push(`- **Vehicle \`${vNum}\`:** Status \`${st}\`${off} · [RTO Work Case](${rUrl})`);
    });
  }

  lines.push('', '#### 6. 💳 Payment Proofs & Slips');
  if (receipts.length === 0) {
    lines.push('- No payment slips or receipts uploaded.');
  } else {
    receipts.slice(0, 5).forEach((rcpt) => {
      const rUrl = text(rcpt.receiptUrl);
      const rLink = rUrl ? `[🧾 View Payment Receipt Image](${rUrl})` : 'No slip file';
      lines.push(`- **${text(rcpt.type || 'Payment')}:** ${currency(rcpt.amount)} · ${rLink}`);
    });
  }

  lines.push(
    '',
    '#### ⚡ Quick Actions:',
    cleanDigits ? `- [📞 ${cleanDigits}](tel:${cleanDigits})` : '',
    waDigits ? `- [💬 WhatsApp](https://wa.me/91${waDigits})` : '',
    driveLinkFormatted ? `- ${driveLinkFormatted}` : '',
    `- [👤 Open Visitor Record in Admin Portal](${profileUrl})`
  );

  return lines.filter(Boolean).join('\n');
};
