type VehicleDocsOperatorInput = {
  message: string;
  toolName: string;
  operatorData: unknown;
};

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const text = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const money = (value: unknown): string => (
  typeof value === 'number' && Number.isFinite(value)
    ? `₹${value.toLocaleString('en-IN')}`
    : '—'
);

interface VehicleDocFile {
  id: string;
  section: string;
  checklistKey?: string;
  label: string;
  fileName: string;
  mimeType: string;
  size?: number;
  date?: string;
  generated?: boolean;
  isVideo?: boolean;
  previewUrl: string;
  downloadUrl: string;
}

interface ChecklistItem {
  key: string;
  label: string;
  section: string;
  state: 'AVAILABLE' | 'NA' | 'NOT_REQUIRED' | string;
  note?: string | null;
  files?: VehicleDocFile[];
}

/**
 * Builds a friendly, structured, human-readable ChatGPT-style response
 * for Vehicle Documents and connected module data with zero masking for internal operators.
 */
export const buildVehicleDocsOperatorAnswer = ({
  message,
  toolName,
  operatorData,
}: VehicleDocsOperatorInput): string | null => {
  if (toolName !== 'vehicle.documents.detail' && toolName !== 'vehicle.documents.summary') return null;

  const root = record(operatorData);

  if (toolName === 'vehicle.documents.summary') {
    const totalVehicles = typeof root.totalVehicles === 'number' ? root.totalVehicles : 0;
    const totalDocuments = typeof root.totalDocuments === 'number' ? root.totalDocuments : 0;
    const dealBreakdown = record(root.dealStatusBreakdown);
    const rtoBreakdown = record(root.rtoStatusBreakdown);
    const vehicles = Array.isArray(root.vehicles) ? root.vehicles as Array<Record<string, unknown>> : [];

    const dealSummary = Object.entries(dealBreakdown)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(' · ') || 'None';

    const rtoSummary = Object.entries(rtoBreakdown)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(' · ') || 'None';

    const lines: string[] = [
      '### 📁 Vehicle Docs Module — Real-Time Current Status (Live All Inventory)',
      '',
      '> 🟢 **Live Real-Time Data**: Platform par mojood sabhi active gaadiyon ka current database status (koi artificial 30-day filter nahi hai; complete real-time inventory overview).',
      '',
      '#### 📊 Live Dossiers Overview:',
      `- 🚜 **Total Vehicle Dossiers in Platform:** **${totalVehicles} Vehicles**`,
      `- 📑 **Total Uploaded Documents & Proofs:** **${totalDocuments} Files**`,
      `- 🤝 **Deal Status Breakdown:** ${dealSummary}`,
      `- 🛡️ **RTO Status Breakdown:** ${rtoSummary}`,
      '',
      '---',
      '',
      '#### 📋 Active Vehicle Dossiers List:',
    ];

    if (vehicles.length === 0) {
      lines.push('- *Abhi koi vehicle dossiers uplabdh nahi hain.*');
    } else {
      vehicles.forEach((v, idx) => {
        const vNum = text(v.vehicleNumber) || '—';
        const title = text(v.title) || 'Vehicle';
        const owner = text(v.owner) || '—';
        const buyer = text(v.buyer) || '—';
        const deal = text(v.dealStatus) || '—';
        const rto = text(v.rtoStatus) || '—';
        const docCount = typeof v.documentsCount === 'number' ? `${v.documentsCount} files` : '—';
        const pdf = (vNum !== '—' && vNum !== 'Vehicle') ? `/api/vehicle-docs/${encodeURIComponent(vNum)}/details.pdf?inline=1` : null;
        const zip = (vNum !== '—' && vNum !== 'Vehicle') ? `/api/vehicle-docs/${encodeURIComponent(vNum)}/zip` : null;
        const links = [
          pdf ? `[📄 Details PDF](${pdf})` : null,
          zip ? `[📦 All Docs ZIP](${zip})` : null,
        ].filter(Boolean).join(' · ');

        lines.push(
          `${idx + 1}. **${vNum}** — ${title}\n` +
          `   - **Owner:** ${owner} | **Buyer:** ${buyer}\n` +
          `   - **Deal:** \`${deal}\` | **RTO:** \`${rto}\` | **Docs:** ${docCount}\n` +
          `   - **Direct Downloads:** ${links}`
        );
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi specific gaadi ke complete documents, checklist ya download links dekhne ke liye uska vehicle number batayein (jaise: "CG11BN7867 ke saare kagaz dikhao").*'
    );

    return lines.join('\n');
  }

  if (!root.found) {
    const requested = text(root.requestedRegistration) || text(root.requestedQuery) || 'vehicle';
    return `Kshama karein, "${requested}" ke liye koi vehicle documents record nahi mila. Kripya registration number (jaise CG11BN7867) ya model name verify karein.`;
  }

  // Handle multiple matching vehicles case
  if (root.multipleMatches && Array.isArray(root.vehicles)) {
    const vehicles = root.vehicles as Array<Record<string, unknown>>;
    const query = text(root.requestedQuery) || 'matching vehicles';
    const lines = vehicles.map((v, i) => {
      const reg = text(v.vehicleNumber) || '—';
      const title = text(v.title) || 'Vehicle';
      const owner = text(v.owner) || '—';
      const buyer = text(v.buyer) || '—';
      const docsCount = typeof v.documentsCount === 'number' ? `${v.documentsCount} documents` : '';
      const pdf = text(v.detailsPdfUrl);
      const zip = text(v.allDocsZipUrl);
      const links = [
        pdf ? `[📄 Details PDF](${pdf})` : null,
        zip ? `[📦 All Docs ZIP](${zip})` : null,
      ].filter(Boolean).join(' · ');

      return `${i + 1}. **${reg}** — ${title}\n   - **Owner:** ${owner} | **Buyer:** ${buyer} | **Docs:** ${docsCount}\n   - ${links}`;
    });

    return [
      `"${query}" ke search me **${vehicles.length} matching vehicles** mile hain:`,
      '',
      lines.join('\n\n'),
      '',
      'Kisi specific gaadi ke documents ya complete dossier dekhne ke liye uska vehicle registration number specify karein (jaise *"CG11BN7867 ke saare kagaz dikhao"*).',
    ].join('\n');
  }

  const item = record(root.item);
  if (!item || !item.vehicleNumber) return null;

  const normalized = message.toLowerCase();
  const vNum = text(item.vehicleNumber) || 'Vehicle';
  const title = text(item.title) || vNum;
  const brand = text(item.brand) || '';
  const model = text(item.model) || '';
  const year = item.year ? String(item.year) : '—';
  const hours = item.hours ? `${Number(item.hours).toLocaleString('en-IN')} hrs` : '—';
  const chassisNo = text(item.chassisNumber) || 'Not recorded';
  const engineNo = text(item.engineNumber) || 'Not recorded';
  const location = text(item.location) || 'Not recorded';
  const owner = text(item.owner) || 'Not recorded';

  const statusBadges = record(item.statusBadges);
  const listingStatus = text(statusBadges.listingStatus) || '—';
  const dealStatus = text(statusBadges.dealStatus) || '—';
  const rtoStatus = text(statusBadges.rtoStatus) || '—';

  const parties = record(item.parties);
  const ownerName = text(parties.ownerName) || owner;
  const sellerName = text(parties.sellerName) || '—';
  const sellerPhone = text(parties.sellerNumber) || '—';
  const purchaserName = text(parties.purchaserName) || '—';
  const purchaserPhone = text(parties.purchaserNumber) || '—';
  const purchaserCity = text(parties.purchaserCity) || '—';

  const dossierDownloads = record(item.dossierDownloads);
  const detailsPdfUrl = text(dossierDownloads.detailsPdfUrl);
  const allDocsZipUrl = text(dossierDownloads.allDocsZipUrl);
  const sectionZipUrls = record(dossierDownloads.sectionZipUrls);

  const checklist = record(item.checklist);
  const checklistItems = (Array.isArray(checklist.items) ? checklist.items : []) as ChecklistItem[];
  const availableCount = checklist.availableCount ?? checklistItems.filter((i) => i.state === 'AVAILABLE').length;
  const missingNaCount = checklist.missingNaCount ?? checklistItems.filter((i) => i.state === 'NA').length;
  const notRequiredCount = checklist.notRequiredCount ?? checklistItems.filter((i) => i.state === 'NOT_REQUIRED').length;

  const documents = (Array.isArray(item.documents) ? item.documents : []) as VehicleDocFile[];

  // Helper for status badge emoji
  const stateBadge = (state: string) => {
    switch (state) {
      case 'AVAILABLE': return '✅ AVAILABLE';
      case 'NA': return '⏳ NA (Pending)';
      case 'NOT_REQUIRED': return '⚪ NOT REQUIRED';
      default: return state;
    }
  };

  // 1. SPECIFIC INTENT: Buyer / Seller KYC queries (Aadhaar, PAN, GST)
  const asksAadhaarOrPan = /\b(?:aadhaar|aadhar|pan|gst|kyc)\b/u.test(normalized);
  if (asksAadhaarOrPan) {
    const kycDocs = checklistItems.filter((i) => /\b(?:aadhaar|aadhar|pan|gst|kyc)\b/i.test(i.label) || /\b(?:aadhaar|aadhar|pan|gst|kyc)\b/i.test(i.key));

    const lines: string[] = [
      `### 🪪 KYC & Identity Documents Status — ${vNum}`,
      `*Vehicle:* **${title}** | *Chassis:* \`${chassisNo}\``,
      '',
      '#### 👤 Parties Information:',
      `- **Registered Owner:** ${ownerName}`,
      `- **Seller:** ${sellerName} · 📞 **Mobile:** ${sellerPhone}`,
      `- **Buyer / Purchaser:** ${purchaserName} · 📞 **Mobile:** ${purchaserPhone} (City: ${purchaserCity})`,
      '',
      '#### 📑 KYC Checklist & Upload Status:',
    ];

    if (kycDocs.length > 0) {
      kycDocs.forEach((doc, idx) => {
        const file = documents.find((d) => d.checklistKey === doc.key || d.label.toLowerCase().includes(doc.label.toLowerCase()));
        const fileLinks = file
          ? ` · [👁️ View](${file.previewUrl}) · [⬇️ Download](${file.downloadUrl})`
          : '';
        lines.push(`${idx + 1}. **${doc.label}** (${doc.section}): ${stateBadge(doc.state)}${fileLinks}${doc.note ? ` (${doc.note})` : ''}`);
      });
    } else {
      lines.push('- Is vehicle ke liye specific KYC checklist items configure nahi hain.');
    }

    if (allDocsZipUrl) {
      lines.push('', `[📦 Download All Documents ZIP](${allDocsZipUrl})`);
    }

    return lines.join('\n');
  }

  // 2. SPECIFIC INTENT: Deeds queries (Sale Deed / Purchase Deed)
  const asksDeeds = /\b(?:deed|sale\s+deed|purchase\s+deed|bainama|kharidnama)\b/u.test(normalized);
  if (asksDeeds) {
    const purchaseDeedFile = documents.find((d) => d.checklistKey === 'purchaseDeed' || /purchase\s+deed/i.test(d.label));
    const saleDeedFile = documents.find((d) => d.checklistKey === 'sellDeed' || /sale\s+deed/i.test(d.label));

    const lines: string[] = [
      `### 📜 Vehicle Deeds (Kharidnama / Bainama) — ${vNum}`,
      `*Vehicle:* **${title}** | *Chassis:* \`${chassisNo}\``,
      '',
      '#### 1. Purchase Deed (Kharidnama — Seller to Platform):',
      `- **Seller Name:** ${sellerName}`,
      `- **Seller Mobile:** ${sellerPhone}`,
      purchaseDeedFile
        ? `- **Document:** ✅ **Uploaded** (${purchaseDeedFile.fileName})\n  - [👁️ View Purchase Deed PDF](${purchaseDeedFile.previewUrl})\n  - [⬇️ Download Purchase Deed PDF](${purchaseDeedFile.downloadUrl})`
        : '- **Document:** ⏳ **Not Uploaded / NA**',
      '',
      '#### 2. Sale Deed (Bainama — Platform to Buyer):',
      `- **Buyer Name:** ${purchaserName}`,
      `- **Buyer Mobile:** ${purchaserPhone} (City: ${purchaserCity})`,
      saleDeedFile
        ? `- **Document:** ✅ **Uploaded** (${saleDeedFile.fileName})\n  - [👁️ View Sale Deed PDF](${saleDeedFile.previewUrl})\n  - [⬇️ Download Sale Deed PDF](${saleDeedFile.downloadUrl})`
        : '- **Document:** ⏳ **Not Uploaded / NA**',
    ];

    if (allDocsZipUrl) {
      lines.push('', '---', `[📦 Download All Documents ZIP](${allDocsZipUrl})`);
    }

    return lines.join('\n');
  }

  // 3. SPECIFIC INTENT: Missing / Pending / NA documents query
  const asksPendingOrNa = /\b(?:pending|missing|na|not\s+available|baki|baaki|chut|adhura|apurn)\b/u.test(normalized)
    && !/\b(?:all\s+docs|saare|sare)\b/u.test(normalized);

  if (asksPendingOrNa) {
    const naItems = checklistItems.filter((i) => i.state === 'NA');
    const notReqItems = checklistItems.filter((i) => i.state === 'NOT_REQUIRED');

    const lines: string[] = [
      `### 📋 Pending & NA Documents Report — ${vNum} (${title})`,
      `*Overall Checklist Status:* ✅ Available: **${availableCount}** | ⏳ NA (Pending): **${missingNaCount}** | ⚪ Not Required: **${notRequiredCount}**`,
      '',
    ];

    if (naItems.length === 0) {
      lines.push('🎉 **Koi bhi document pending ya NA nahi hai!** Saare zaroori documents uploaded aur available hain.');
    } else {
      lines.push('#### ⏳ Documents jo abhi upload nahi hue (Marked NA / Pending):');
      naItems.forEach((i, idx) => {
        lines.push(`${idx + 1}. **${i.label}** (${i.section})${i.note ? ` — *Note:* ${i.note}` : ''}`);
      });
    }

    if (notReqItems.length > 0) {
      lines.push('', '#### ⚪ Documents jo is deal ke liye require nahi hain (NOT REQUIRED):');
      notReqItems.forEach((i, idx) => {
        lines.push(`${idx + 1}. **${i.label}** (${i.section})${i.note ? ` — *Reason:* ${i.note}` : ''}`);
      });
    }

    if (detailsPdfUrl || allDocsZipUrl) {
      lines.push('', '---', '#### 📦 Master Dossier Links:');
      if (detailsPdfUrl) lines.push(`- [📄 View / Download Vehicle Details PDF](${detailsPdfUrl})`);
      if (allDocsZipUrl) lines.push(`- [📦 Download Available Documents ZIP](${allDocsZipUrl})`);
    }

    return lines.join('\n');
  }

  // 4. SPECIFIC INTENT: ZIP / PDF Dossier Download Link request
  const asksZipOrPdfOnly = /\b(?:all\s+docs?\s+zip|zip\s+file|zip\s+link|details\s+pdf|dossier\s+pdf)\b/u.test(normalized)
    && !/\b(?:saare|sare|all\s+documents|all\s+papers|puri|poori)\b/u.test(normalized);
  if (asksZipOrPdfOnly) {
    const lines: string[] = [
      `### 📦 Download Vehicle Dossier & Documents — ${vNum}`,
      `*Vehicle:* **${title}** (Chassis: \`${chassisNo}\`)`,
      '',
      'Aap niche diye gaye direct links se ek click me master files download kar sakte hain:',
      '',
      '#### 🌟 Master Dossier Downloads:',
    ];
    if (detailsPdfUrl) {
      lines.push(`- **📄 Vehicle Details Summary PDF:** [Download PDF](${detailsPdfUrl}) *(Ek hi sheet me puri vehicle, RTO aur sales history)*`);
    }
    if (allDocsZipUrl) {
      lines.push(`- **📦 Complete Documents ZIP Archive:** [Download ZIP](${allDocsZipUrl}) *(Saare sections ke available documents ek saath)*`);
    }

    const availableSections = Object.entries(sectionZipUrls).filter(([, url]) => Boolean(url));
    if (availableSections.length > 0) {
      lines.push('', '#### 📂 Section-Wise ZIP Downloads:');
      availableSections.forEach(([sec, url]) => {
        lines.push(`- **${sec} ZIP:** [Download Section ZIP](${url})`);
      });
    }

    return lines.join('\n');
  }

  // 5. DEFAULT COMPREHENSIVE DOSSIER RESPONSE (ChatGPT-style Human Readable)
  const sales = Array.isArray(item.sales) ? item.sales as Array<Record<string, unknown>> : [];
  const primarySale = sales[0];
  const rto = record(item.rto);
  const rtoValidities = record(rto.validities);

  const sectionsList = (Array.isArray(item.sections) ? item.sections : [
    'Seller & Purchase',
    'Buyer & Sale',
    'Invoices & Payments',
    'RTO Transfer',
    'Listing & Photos',
    'Other',
  ]) as string[];

  const lines: string[] = [
    `### 📑 Vehicle Documents Dossier — ${vNum}`,
    `**${title}** · *${brand} ${model}* (${year})`,
    '',
    '#### 🚜 1. Vehicle Identity & Status',
    `- **Registration Number:** \`${vNum}\``,
    `- **Chassis Number:** \`${chassisNo}\``,
    `- **Engine Number:** \`${engineNo}\``,
    `- **Operating Hours:** ${hours} · **Location:** ${location}`,
    `- **Status Badges:** 🟢 Listing: \`${listingStatus}\` | 🔵 Sale: \`${dealStatus}\` | 🟣 RTO: \`${rtoStatus}\``,
    '',
    '#### 👥 2. Parties Information (Unmasked)',
    `- **Registered Owner:** ${ownerName}`,
    `- **Seller (Purchase):** ${sellerName} · 📞 **Mobile:** ${sellerPhone}`,
    `- **Buyer (Sale):** ${purchaserName} · 📞 **Mobile:** ${purchaserPhone} (City: ${purchaserCity})`,
    '',
    '#### 📦 3. Master Dossier Downloads',
    detailsPdfUrl ? `- **📄 Vehicle Details PDF:** [View / Download PDF](${detailsPdfUrl})` : '',
    allDocsZipUrl ? `- **📦 Complete All-Docs ZIP:** [Download All Documents ZIP](${allDocsZipUrl})` : '',
    '',
    `#### 📋 4. Documents Checklist Summary (Total ${checklistItems.length})`,
    `> **Status Breakdown:** ✅ Available: **${availableCount}** | ⏳ NA / Pending: **${missingNaCount}** | ⚪ Not Required: **${notRequiredCount}**`,
    '',
  ].filter(Boolean);

  // Group documents and checklist by Section
  sectionsList.forEach((sectionName) => {
    const secItems = checklistItems.filter((i) => i.section === sectionName);
    const secDocs = documents.filter((d) => d.section === sectionName);
    const secZip = text(sectionZipUrls[sectionName]);

    lines.push(`##### 📁 Section: ${sectionName}`);
    if (secZip) {
      lines.push(`*Section ZIP Archive:* [Download ${sectionName} ZIP](${secZip})`);
    }

    if (secItems.length === 0 && secDocs.length === 0) {
      lines.push('- *Is section me koi document configure nahi hai.*', '');
      return;
    }

    secItems.forEach((ci) => {
      const matchedFiles = secDocs.filter((d) => d.checklistKey === ci.key || (ci.files && ci.files.some((f) => f.id === d.id)));
      const fileText = matchedFiles.length > 0
        ? matchedFiles.map((f) => `[👁️ View ${f.label}](${f.previewUrl}) · [⬇️ Download](${f.downloadUrl})`).join(' | ')
        : 'No file uploaded';
      lines.push(`- **${ci.label}:** ${stateBadge(ci.state)} ${matchedFiles.length > 0 ? `(${fileText})` : ''}${ci.note ? ` — *Note:* ${ci.note}` : ''}`);
    });

    // Also list any loose documents in this section that were not in checklist
    const looseDocs = secDocs.filter((d) => !secItems.some((ci) => ci.key === d.checklistKey || (ci.files && ci.files.some((f) => f.id === d.id))));
    if (looseDocs.length > 0) {
      looseDocs.forEach((d) => {
        lines.push(`- **${d.label}:** [👁️ View](${d.previewUrl}) · [⬇️ Download](${d.downloadUrl}) (${d.fileName})`);
      });
    }

    lines.push('');
  });

  // RTO Compliance Section
  if (rto && (rto.office || rtoValidities.tax || rtoValidities.fitness)) {
    const taxRec = record(rtoValidities.tax);
    const fitRec = record(rtoValidities.fitness);
    const insRec = record(rtoValidities.insurance);
    const pucRec = record(rtoValidities.puc);
    const hsrpRec = record(rtoValidities.hsrp);

    lines.push(
      '#### 🛡️ 5. RTO Transfer & Compliance Details',
      `- **RTO Office:** ${text(rto.office) || '—'} · **RTO Status:** \`${text(rto.status) || '—'}\``,
      `- **RTO Agent:** ${text(rto.agent) || '—'}`,
      `- **Road Tax:** ${text(taxRec.status) || '—'} ${taxRec.validUntil ? `(Valid until: ${text(taxRec.validUntil)})` : ''}`,
      `- **Fitness:** ${text(fitRec.status) || '—'} ${fitRec.validUntil ? `(Valid until: ${text(fitRec.validUntil)})` : ''}`,
      `- **Insurance:** ${text(insRec.status) || '—'} ${insRec.validUntil ? `(Valid until: ${text(insRec.validUntil)})` : ''}`,
      `- **PUC:** ${text(pucRec.status) || '—'} ${pucRec.validUntil ? `(Valid until: ${text(pucRec.validUntil)})` : ''}`,
      `- **HSRP:** ${text(hsrpRec.status) || '—'} ${hsrpRec.number ? `(Number: \`${text(hsrpRec.number)}\`)` : ''}`,
      '',
    );
  }

  // Commercial Reconciliation Section (if sale record exists)
  if (primarySale) {
    const invNo = text(primarySale.invoiceNumber);
    const crNo = text(primarySale.creditNoteNumber);
    lines.push(
      '#### 💰 6. Commercial Deal & Invoice Information',
      `- **Deal Record:** \`${text(primarySale.recordNumber) || '—'}\` · **Deal Status:** \`${text(primarySale.dealStatus) || '—'}\``,
      `- **Purchase Amount:** ${money(primarySale.purchaseAmount)} | **Sale Amount:** ${money(primarySale.sellAmount)}`,
      `- **Total Received from Buyer:** ${money(primarySale.received)} | **Paid to Seller:** ${money(primarySale.paidToSeller)}`,
      invNo ? `- **Bill of Supply / Invoice No:** \`${invNo}\`` : '- **Invoice No:** Not generated yet',
      crNo ? `- **Credit Note No:** \`${crNo}\`` : '',
      '',
    );
  }

  lines.push('---', '*Tip: Kisi bhi document ko dekhne ke liye upar diye gaye direct view/download links par click karein.*');

  return lines.filter(Boolean).join('\n');
};
