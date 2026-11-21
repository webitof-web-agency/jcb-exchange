type TasksOperatorInput = {
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

const statusBadge = (status: string | null): string => {
  if (!status) return '—';
  const norm = status.toUpperCase();
  if (norm === 'TRANSFERRED' || norm === 'COMPLETED' || norm === 'DONE') return '🟢 Transferred';
  if (norm === 'NOT_REQUIRED') return '⚪ Not Required';
  if (norm === 'TRANSFER_INITIATED' || norm === 'RENEWAL_IN_PROGRESS' || norm === 'IN_PROGRESS') return '🟡 In Progress';
  if (norm === 'ISSUE_REPORTED' || norm === 'FAILED') return '🔴 Issue Reported';
  if (norm === 'DOCUMENT_EXPIRED') return '🟠 Expired';
  if (norm === 'PENDING') return '⏳ Pending';
  return `\`${status}\``;
};

/**
 * Builds a structured, human-readable ChatGPT-style response
 * for RTO Transfer & Compliance Tasks with 100% real-time data and zero masking.
 */
export const buildTasksOperatorAnswer = ({
  message,
  toolName,
  operatorData,
}: TasksOperatorInput): string | null => {
  if (toolName !== 'tasks.compliance.overview' && toolName !== 'tasks.compliance.detail') return null;

  const root = record(operatorData);

  // 1. Overview Answer Mode
  if (toolName === 'tasks.compliance.overview') {
    const totalVehicles = typeof root.totalVehicles === 'number' ? root.totalVehicles : 0;
    const totalMilestones = typeof root.totalMilestones === 'number' ? root.totalMilestones : 0;
    const pendingAction = typeof root.pendingAction === 'number' ? root.pendingAction : 0;
    const inProcessing = typeof root.inProcessing === 'number' ? root.inProcessing : 0;
    const issuesReported = typeof root.issuesReported === 'number' ? root.issuesReported : 0;
    const transferredOrDone = typeof root.transferredOrDone === 'number' ? root.transferredOrDone : 0;
    const completionPercentage = typeof root.completionPercentage === 'number' ? root.completionPercentage : 0;
    const mandatoryCount = typeof root.mandatoryCount === 'number' ? root.mandatoryCount : 0;
    const optionalCount = typeof root.optionalCount === 'number' ? root.optionalCount : 0;
    const vehicles = Array.isArray(root.vehicles) ? root.vehicles as Array<Record<string, unknown>> : [];

    const lines: string[] = [
      '### 📋 RTO Transfer & Compliance Tasks Desk — Real-Time Operations Overview',
      '',
      '> 🟢 **Live Real-Time Data**: Platform par mojood sabhi active vehicle transfer files ka live database status (koi artificial 30-day filter nahi hai; complete real-time operations overview).',
      '',
      '#### 📊 Operations Desk Metrics:',
      `- 🚜 **Total Vehicles Under Transfer:** **${totalVehicles} Vehicles**`,
      `- 📑 **Total Checklist Milestones:** **${totalMilestones} Milestones** (${mandatoryCount} Mandatory · ${optionalCount} Optional)`,
      `- ⏳ **Pending Action:** **${pendingAction}** (Awaiting start / docs)`,
      `- 🔄 **In Processing:** **${inProcessing}** (Renewal or RTO filed)`,
      `- ⚠️ **Issues / Blockers:** **${issuesReported}** (Reported blockers)`,
      `- 🟢 **Transferred / Done:** **${transferredOrDone} (${completionPercentage}%)**`,
      '',
      '---',
      '',
      '#### 📋 Active Vehicles Under Transfer:',
    ];

    if (vehicles.length === 0) {
      lines.push('- *Abhi transfer desk par koi active vehicle files nahi hain.*');
    } else {
      vehicles.forEach((v, idx) => {
        const vNum = text(v.vehicleNumber) || '—';
        const title = text(v.title) || 'Vehicle';
        const customer = text(v.customerName) || '—';
        const deal = text(v.dealNumber) || '—';
        const office = text(v.rtoOffice) || '—';
        const done = v.milestonesDone ?? '—';
        const total = v.milestonesTotal ?? '—';
        const percent = v.completionPercentage ?? '—';
        const blockers = typeof v.blockersCount === 'number' && v.blockersCount > 0 ? ` · ⚠️ **${v.blockersCount} Blocker(s)**` : '';

        const docsUrl = vNum !== '—' ? `/employee/accounts/vehicle-docs/${encodeURIComponent(vNum)}` : null;
        const links = [
          docsUrl ? `[📁 Vehicle Docs](${docsUrl})` : null,
          vNum !== '—' ? `[📄 Details PDF](/api/vehicle-docs/${encodeURIComponent(vNum)}/details.pdf?inline=1)` : null,
          vNum !== '—' ? `[📦 All Docs ZIP](/api/vehicle-docs/${encodeURIComponent(vNum)}/zip)` : null,
        ].filter(Boolean).join(' · ');

        lines.push(
          `${idx + 1}. **${vNum}** — ${title}\n` +
          `   - **Customer & Deal:** ${customer} · Deal: \`${deal}\`\n` +
          `   - **RTO Office:** ${office} | **Progress:** **${done}/${total} Milestones (${percent}%)**${blockers}\n` +
          `   - **Direct Links:** ${links}`
        );
      });
    }

    lines.push(
      '',
      '---',
      '💡 *Tip: Kisi specific gaadi ke complete 7 milestones, staff remarks ya customer deal details dekhne ke liye vehicle number ya customer name batayein (jaise: "CG 11 BN 7867 ke tasks" ya "Satish Kumar Banjare ke tasks").*'
    );

    return lines.join('\n');
  }

  // 2. Detail Answer Mode
  if (!root.found) {
    const requested = text(root.requestedQuery) || text(root.requestedVehicle) || 'vehicle';
    return `Kshama karein, "${requested}" ke liye koi active RTO transfer task record nahi mila. Kripya vehicle number (jaise CG 11 BN 7867), customer name (jaise Satish Kumar Banjare) ya deal number (#SA-2026-001) verify karein.`;
  }

  const vNum = text(root.vehicleNumber) || 'Vehicle';
  const title = text(root.title) || 'Machine';
  const completionPercentage = typeof root.completionPercentage === 'number' ? root.completionPercentage : 0;
  const milestonesDone = typeof root.milestonesDone === 'number' ? root.milestonesDone : 0;
  const milestonesTotal = typeof root.milestonesTotal === 'number' ? root.milestonesTotal : 7;
  const chassis = text(root.chassisNumber) || '—';
  const engine = text(root.engineNumber) || '—';

  const parties = record(root.parties);
  const customer = record(parties.customer);
  const seller = record(parties.seller);
  const custName = text(customer.name) || '—';
  const custPhone = text(customer.number) ? ` · 📞 ${text(customer.number)}` : '';
  const custCity = text(customer.city) ? ` (${text(customer.city)})` : '';
  const sellerName = text(seller.name) || '—';
  const sellerPhone = text(seller.number) ? ` · 📞 ${text(seller.number)}` : '';

  const deal = record(root.deal);
  const dealRef = text(deal.recordNumber) || '—';
  const dealStatus = text(deal.dealStatus) || '—';
  const invNo = text(deal.invoiceNumber);

  const rto = record(root.rto);
  const rtoOffice = text(rto.office) || '—';
  const rtoStatus = text(rto.masterStatus) || text(rto.status) || '—';
  const agent = record(rto.agent);
  const agentName = text(agent.name) || '—';
  const agentPhone = text(agent.number) ? ` (📞 ${text(agent.number)})` : '';
  const agentCity = text(agent.city) ? ` · ${text(agent.city)}` : '';
  const expenses = record(rto.expenses);

  const milestones = Array.isArray(root.milestones) ? root.milestones as Array<Record<string, unknown>> : [];

  const lines: string[] = [
    `### 📋 360° RTO Transfer & Compliance Tasks — ${vNum} (${title})`,
    '',
    `> 🟢 **Transfer Progress:** **${completionPercentage}% Completed** (${milestonesDone} of ${milestonesTotal} Milestones Transferred / Closed)  `,
    `> 🚜 **Vehicle:** ${title} · Reg: \`${vNum}\` · Chassis: \`${chassis}\`  `,
    `> 👤 **Customer & Deal:** **${custName}**${custPhone} · Deal: \`${dealRef}\`  `,
    `> 🏛️ **RTO Authority:** ${rtoOffice} · Master Case Status: \`${rtoStatus}\`  `,
    `> 🕒 **Real-Time Data:** Platform live database (No artificial 30-day filter; live current state).`,
    '',
    '---',
    '',
    '#### 📊 1. Milestones Checklist Breakdown (7 Milestones):',
    '',
    '| # | Milestone | Requirement | Status | Staff Remarks & Activity | Proofs |',
    '|---|---|---|---|---|---|',
  ];

  if (milestones.length === 0) {
    lines.push('| — | No milestones found | — | — | — | — |');
  } else {
    milestones.forEach((m, idx) => {
      const label = text(m.label) || text(m.taskKey) || `Milestone ${idx + 1}`;
      const opt = m.isOptional ? 'Optional' : 'Mandatory';
      const st = statusBadge(text(m.status));
      const remark = text(m.remark) ? `*“${text(m.remark)}”*` : '—';
      const docs = Array.isArray(m.documents) ? m.documents as Array<Record<string, unknown>> : [];
      let proofsStr = '—';
      if (docs.length > 0) {
        proofsStr = docs.map((doc, dIdx) => {
          const docName = text(doc.fileName) || `Proof ${dIdx + 1}`;
          const url = text(doc.fileUrl) || text(doc.url) || `/api/vehicle-docs/${encodeURIComponent(vNum)}/files/${encodeURIComponent(String(doc.id || dIdx))}`;
          return `📄 [${docName}](${url})`;
        }).join('<br/>');
      }
      lines.push(`| ${idx + 1} | **${label}** | ${opt} | ${st} | ${remark} | ${proofsStr} |`);
    });
  }

  lines.push(
    '',
    '---',
    '',
    '#### 👤 2. Commercial Deal & Parties Linkage (Unmasked):',
    `- **Purchaser / Customer:** **${custName}**${custPhone}${custCity}`,
    `- **Previous Owner / Seller:** **${sellerName}**${sellerPhone}`,
    `- **Deal Reference:** \`${dealRef}\` · **Deal Status:** \`${dealStatus}\``,
    `- **Commercials:** Sale Amount: ${money(deal.sellAmount)} | Purchase Amount: ${money(deal.purchaseAmount)}`,
    `- **Payments Received:** ${money(deal.received)} | **Paid to Seller:** ${money(deal.paidToSeller)}`,
    invNo ? `- **Bill of Supply / Invoice:** \`${invNo}\`` : '- **Invoice No:** Not generated yet',
    '',
    '---',
    '',
    '#### 🏛️ 3. RTO Authority & Agent Operations:',
    `- **RTO Office:** **${rtoOffice}**`,
    `- **RTO Agent:** **${agentName}**${agentPhone}${agentCity}`,
    `- **Expenses & Fees:** Total Fee: ${money(expenses.total)} | Advance Paid: ${money(expenses.advance)} | **Balance Due to Agent:** ${money(expenses.balance)}`,
    `- **Case Lock Status:** ${rto.isLocked ? '🔒 Locked' : '🔓 Active'}`,
    '',
    '---',
    '',
    '#### 📦 4. Master Downloads & Direct Actions:',
    `- 📄 [Download Complete Vehicle Details PDF Dossier](/api/vehicle-docs/${encodeURIComponent(vNum)}/details.pdf?inline=1)`,
    `- 📦 [Download All Documents ZIP](/api/vehicle-docs/${encodeURIComponent(vNum)}/zip)`,
  );

  const certUrl = text(root.rtoCertificateUrl);
  if (certUrl) {
    lines.push(`- 📜 [Download Official RTO Transfer Certificate PDF](${certUrl})`);
  }

  lines.push(
    `- 🔗 [Open RTO Workspace](/employee/rto) · 📁 [Open Vehicle Docs](/employee/accounts/vehicle-docs/${encodeURIComponent(vNum)}) · 💼 [Open Deal Record](/employee/accounts/sell-accounts)`
  );

  return lines.join('\n');
};
