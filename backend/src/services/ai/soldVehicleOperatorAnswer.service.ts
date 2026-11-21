import { buildVehicleDocsOperatorAnswer } from './vehicleDocsOperatorAnswer.service';
import { buildTasksOperatorAnswer } from './tasksOperatorAnswer.service';

type OperatorAnswerInput = {
  message: string;
  toolName: string;
  operatorData: unknown;
};

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

/**
 * Answers narrow identity, contact, and summary questions from the authenticated portal-only
 * detail projection or module summary. This ensures names, phone numbers, vehicle numbers,
 * and financial totals are answered in clear, friendly Roman Hindi (like ChatGPT) without any masking.
 */
export const buildSoldVehicleOperatorAnswer = ({ message, toolName, operatorData }: OperatorAnswerInput): string | null => {
  const normalized = message.toLocaleLowerCase('en-IN');
  const root = record(operatorData);

  const asksVehicleNumber = /\b(?:vehicle\s+number|gaadi\s+number|gadi\s+number|registration\s+number|rc\s+number|chassis\s+number)\b/u.test(normalized);
  const asksSeller = /\b(?:seller|sellor|seller\s+name|seller\s+ka\s+naam|seller\s+naam|seller\s+details?)\b/u.test(normalized);
  const asksBuyer = /\b(?:purchaser|buyer|buyer\s+name|buyer\s+ka\s+naam|customer\s+name|purchaser\s+name|buyer\s+details?|purchaser\s+details?)\b/u.test(normalized);
  const asksOwner = /\b(?:owner|owner\s+name|owner\s+ka\s+naam|owner\s+details?)\b/u.test(normalized);
  const asksPhone = !asksVehicleNumber && /\b(?:phone|mobile|contact|cell|number|no)\b/u.test(normalized);
  const asksProfit = /\b(?:profit|fayda|bachat|kamai|margin|net\s*profit|kitne\s+ka\s+profit)\b/u.test(normalized);

  if (toolName === 'vehicle.documents.detail' || toolName === 'vehicle.documents.summary') {
    return buildVehicleDocsOperatorAnswer({ message, toolName, operatorData });
  }

  if (toolName === 'tasks.compliance.overview' || toolName === 'tasks.compliance.detail') {
    return buildTasksOperatorAnswer({ message, toolName, operatorData });
  }

  if (toolName === 'rto.work.detail' && root.found === true) {
    const rto = record(root.rto);
    const vehicle = record(root.vehicle);
    const parties = record(root.parties);
    const agent = record(rto.agent);
    const expenses = record(rto.expenses);
    const tasks = record(root.tasks);
    const compliance = record(root.compliance);
    const documents = record(root.documents);
    const soldVehicle = record(root.soldVehicle);
    const missingFields = Array.isArray(root.missingFields)
      ? root.missingFields.map((field) => text(field)).filter((field): field is string => Boolean(field))
      : [];
    const relationshipWarnings = Array.isArray(root.relationshipWarnings)
      ? root.relationshipWarnings.map((warning) => text(warning)).filter((warning): warning is string => Boolean(warning))
      : [];
    const display = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      return text(value) || 'Not recorded in current record.';
    };
    const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
      ? `₹${value.toLocaleString('en-IN')}`
      : 'Not recorded in current record.';
    const line = (label: string, value: unknown) => `${label}: ${display(value)}`;
    const taskItems = Array.isArray(tasks.items) ? tasks.items.map(record) : [];
    const isClosedTask = (task: Record<string, unknown>) => /^(?:completed|done|transferred|not[_ ]required|skipped)$/iu.test(text(task.status) || '');
    const pendingTasks = taskItems.filter((task) => !isClosedTask(task));
    const taskSummary = taskItems.length
      ? taskItems.map((task, index) => `${index + 1}. ${display(task.label || 'Task')} — ${display(task.status || 'Not started')}${text(task.remark) ? ` (${text(task.remark)})` : ''}`).join('\n')
      : 'Koi transfer task record current record me nahi hai.';
    const blockerSummary = pendingTasks.length
      ? pendingTasks.map((task) => `${display(task.label || 'Pending task')}${text(task.remark) ? ` — ${text(task.remark)}` : ' — action pending'}`).join('\n')
      : 'Koi pending blocker record nahi hai.';
    const documentItems = Array.isArray(documents.items) ? documents.items.map(record) : [];
    const documentSummary = documentItems.length
      ? documentItems.map((document, index) => {
        const label = text(document.fileName) || text(document.label) || text(document.taskLabel) || text(document.kind) || 'Document';
        return `${index + 1}. ${/https?:\/\//iu.test(label) ? 'Secure document file' : label}${text(document.taskLabel) && label !== document.taskLabel ? ` (${text(document.taskLabel)})` : ''}`;
      }).join('\n')
      : 'Is RTO record ke saath koi document metadata nahi mila.';
    const statusHistory = Array.isArray(tasks.statusHistory) ? tasks.statusHistory.map(record) : [];
    const historySummary = statusHistory.length
      ? statusHistory.slice(0, 5).map((entry, index) => `${index + 1}. ${display(entry.status)}${text(entry.note) ? ` — ${text(entry.note)}` : ''}${text(entry.createdAt) ? ` (${text(entry.createdAt)})` : ''}`).join('\n')
      : null;
    const nextAction = pendingTasks[0]
      ? `${display(pendingTasks[0].label || 'Pending RTO task')}${text(pendingTasks[0].remark) ? ` — ${text(pendingTasks[0].remark)}` : ' — is task ko complete karke status update karein.'}`
      : 'RTO transfer tasks complete hain; final office confirmation aur closure verify karein.';
    return [
      `RTO dossier mil gaya: ${display(vehicle.registrationNumber)}`,
      '',
      'Vehicle summary',
      line('Vehicle', vehicle.registrationNumber),
      line('Chassis', vehicle.chassisNumber),
      line('Engine', vehicle.engineNumber),
      line('Brand / Model', [text(vehicle.brand), text(vehicle.model)].filter(Boolean).join(' / ')),
      line('Type', vehicle.type),
      line('Manufacturing year', vehicle.manufacturingYear),
      line('Operating hours', vehicle.operatingHours),
      '',
      'RTO status',
      line('RTO office', rto.office),
      line('Status', rto.status),
      line('Documents sent on', rto.documentSendDate),
      line('Case locked', rto.isLocked),
      '',
      'Compliance',
      line('Tax', record(compliance.tax).status),
      line('Fitness', record(compliance.fitness).status),
      line('Insurance', record(compliance.insurance).status),
      line('PUC', record(compliance.puc).status),
      line('HSRP', [text(record(compliance.hsrp).status), text(record(compliance.hsrp).number)].filter(Boolean).join(' / ')),
      '',
      'Pending blockers',
      blockerSummary,
      ...(missingFields.length ? [`Missing data fields: ${missingFields.join(', ')}`] : []),
      ...(relationshipWarnings.length ? [`Data warning: ${relationshipWarnings.join(' ')}`] : []),
      '',
      'Task progress',
      `Completed: ${display(tasks.completed ?? 0)} of ${display(tasks.total ?? taskItems.length)}; pending: ${display(tasks.pending ?? pendingTasks.length)}`,
      taskSummary,
      ...(historySummary ? ['', 'Recent RTO history', historySummary] : []),
      '',
      'Available documents',
      `Available: ${display(documents.availableCount ?? 0)} of ${display(documents.total ?? documentItems.length)}`,
      documentSummary,
      'Secure open/view/download actions answer ke neeche available hain; raw file URL expose nahi kiya gaya hai.',
      '',
      'Buyer/seller/agent details',
      line('Customer', record(parties.customer).name),
      line('Seller', record(parties.seller).name),
      line('Purchaser', record(parties.purchaser).name),
      line('Customer contact', record(parties.customer).number),
      line('Seller contact', record(parties.seller).number),
      line('Purchaser contact', record(parties.purchaser).number),
      line('Financer', record(parties.financer).name),
      line('Hire-purchase status', record(parties.financer).hirePurchaseStatus),
      'Agent details',
      line('Agent name', agent.name),
      line('Agent city/state', [text(agent.city), text(agent.state)].filter(Boolean).join(' / ')),
      line('Agent contact', agent.number),
      '',
      'Expenses/payments',
      line('Total RTO expense', expenses.total !== undefined ? money(expenses.total) : undefined),
      line('Advance paid', expenses.advance !== undefined ? money(expenses.advance) : undefined),
      line('Balance due', expenses.balance !== undefined ? money(expenses.balance) : undefined),
      line('Payment records', soldVehicle.paymentCount),
      line('Refund records', soldVehicle.refundCount),
      '',
      'Invoice/finance status',
      line('Record number', soldVehicle.recordNumber),
      line('Invoice number', soldVehicle.invoiceNumber),
      line('Deal status', soldVehicle.status),
      line('Purchase amount', soldVehicle.purchaseAmount !== undefined ? money(soldVehicle.purchaseAmount) : undefined),
      line('Sell amount', soldVehicle.sellAmount !== undefined ? money(soldVehicle.sellAmount) : undefined),
      line('Deal expenses', soldVehicle.expenses !== undefined ? money(soldVehicle.expenses) : undefined),
      line('Net profit', soldVehicle.netProfit !== undefined ? money(soldVehicle.netProfit) : undefined),
      '',
      'Next action',
      nextAction,
    ].join('\n');
  }

  if (toolName === 'sold.vehicle.detail') {
    const parties = record(root.parties);
    const seller = record(parties.seller);
    const purchaser = record(parties.purchaser);
    const owner = record(parties.owner);
    const vehicle = record(root.vehicle);

    if (asksVehicleNumber) {
      return `Vehicle registration number: ${text(vehicle.number) || 'database me available nahi hai.'}`;
    }
    if (asksSeller && asksPhone && !asksBuyer && !asksOwner) {
      if (/\b(?:name|naam)\b/u.test(normalized)) {
        return `Seller name: ${text(seller.name) || 'N/A'}, Contact number: ${text(seller.number) || 'N/A'}`;
      }
      return `Seller contact number: ${text(seller.number) || 'database me available nahi hai.'}`;
    }
    if (asksSeller) {
      return `Seller name: ${text(seller.name) || 'database me available nahi hai.'}`;
    }
    if (asksBuyer && asksPhone && !asksSeller && !asksOwner) {
      if (/\b(?:name|naam)\b/u.test(normalized)) {
        return `Buyer/purchaser name: ${text(purchaser.name) || 'N/A'}, Contact number: ${text(purchaser.number) || 'N/A'}`;
      }
      return `Buyer/purchaser contact number: ${text(purchaser.number) || 'database me available nahi hai.'}`;
    }
    if (asksBuyer) {
      return `Buyer/purchaser name: ${text(purchaser.name) || 'database me available nahi hai.'}`;
    }
    if (asksOwner && asksPhone) {
      if (/\b(?:name|naam)\b/u.test(normalized)) {
        return `Owner name: ${text(owner.name) || 'N/A'}, Contact number: ${text(owner.number) || 'N/A'}`;
      }
      return `Owner contact number: ${text(owner.number) || 'database me available nahi hai.'}`;
    }
    if (asksOwner) {
      return `Owner name: ${text(owner.name) || 'database me available nahi hai.'}`;
    }
    if (asksPhone && !asksBuyer && !asksOwner) {
      return `Seller contact number: ${text(seller.number) || 'database me available nahi hai.'}`;
    }
    if (asksProfit || /\b(?:gst|tax)\b/u.test(normalized)) {
      const deal = record(root.deal);
      const financials = record(deal.financials);
      const netProfit = financials.sourceNetProfit ?? deal.netProfit;
      const profitAfterGst = financials.sourceNetProfitAfterGst ?? deal.netProfitAfterGst;
      const gstRate = deal.gstRatePercent;
      const sell = deal.sellAmount;
      const purchase = deal.purchaseAmount;
      const exp = deal.expenses;
      const rupee = '\u20b9';
      return `Machine deal me:\n- Net Profit (Gross): ${typeof netProfit === 'number' ? `${rupee}${netProfit.toLocaleString('en-IN')}` : 'N/A'}\n- GST Rate: ${gstRate !== undefined ? `${gstRate}%` : 'N/A'}\n- Net Profit (After GST): ${typeof profitAfterGst === 'number' ? `${rupee}${profitAfterGst.toLocaleString('en-IN')}` : 'N/A'}\n- Sell Amount: ${typeof sell === 'number' ? `${rupee}${sell.toLocaleString('en-IN')}` : 'N/A'}\n- Purchase Amount: ${typeof purchase === 'number' ? `${rupee}${purchase.toLocaleString('en-IN')}` : 'N/A'}\n- Expenses: ${typeof exp === 'number' ? `${rupee}${exp.toLocaleString('en-IN')}` : 'N/A'}`;
    }
    return null;
  }

  // Check profit / summary totals if asked
  if (asksProfit && root.summary) {
    const sum = record(root.summary);
    if (sum.netProfitAfterGst !== undefined || sum.purchaseAmount !== undefined) {
      const netProfit = typeof sum.netProfitAfterGst === 'number'
        ? `₹${sum.netProfitAfterGst.toLocaleString('en-IN')}`
        : `${sum.netProfitAfterGst ?? '0'}`;
      const purchase = typeof sum.purchaseAmount === 'number'
        ? `₹${sum.purchaseAmount.toLocaleString('en-IN')}`
        : `${sum.purchaseAmount ?? '0'}`;
      const sell = typeof sum.sellAmount === 'number'
        ? `₹${sum.sellAmount.toLocaleString('en-IN')}`
        : `${sum.sellAmount ?? '0'}`;
      const exp = typeof sum.expenses === 'number'
        ? `₹${sum.expenses.toLocaleString('en-IN')}`
        : `${sum.expenses ?? '0'}`;
      return `Sold vehicle module me total net profit (after GST) ${netProfit} hai. (Total Purchase: ${purchase}, Total Sell: ${sell}, Total Expenses: ${exp})`;
    }
  }

  // Support module listings and searches: sell.accounts.summary, sold.vehicles, sold.vehicle.search
  const rawList = Array.isArray(root.items) ? root.items : (Array.isArray(root.candidates) ? root.candidates : null);
  if (!rawList) return null;

  const items = rawList.map(record);
  if (items.length === 0) {
    if (asksSeller || asksBuyer || asksOwner || asksVehicleNumber || asksPhone) {
      return 'Sold vehicle module me koi record available nahi hai.';
    }
    return null;
  }

  if (items.length === 1) {
    const item = items[0]!;
    const recLabel = text(item.recordNumber) || text(item.vehicleNumber) || 'Deal';
    const sName = text(item.sellerName);
    const sNum = text(item.sellerNumber);
    const bName = text(item.purchaserName) || text(item.buyerName);
    const bNum = text(item.purchaserNumber) || text(item.buyerPhone);
    const oName = text(item.ownerName);
    const oNum = text(item.ownerNumber);
    const vNum = text(item.vehicleNumber);

    if (asksVehicleNumber) {
      return `Deal ${recLabel} ka vehicle registration number ${vNum || 'database me available nahi hai.'} hai.`;
    }
    if (asksSeller && asksPhone && !asksBuyer && !asksOwner) {
      return `Sold vehicle module me deal ${recLabel} ke seller ka naam ${sName || 'N/A'} aur contact number ${sNum || 'N/A'} hai.`;
    }
    if (asksSeller) {
      return `Sold vehicle module me deal ${recLabel} ke seller ka naam: ${sName || 'database me available nahi hai.'}${sNum ? ` (Contact: ${sNum})` : ''}`;
    }
    if (asksBuyer && asksPhone && !asksSeller && !asksOwner) {
      return `Deal ${recLabel} ke buyer/purchaser ka naam ${bName || 'N/A'} aur contact number ${bNum || 'N/A'} hai.`;
    }
    if (asksBuyer) {
      return `Deal ${recLabel} ke buyer/purchaser ka naam: ${bName || 'database me available nahi hai.'}${bNum ? ` (Contact: ${bNum})` : ''}`;
    }
    if (asksOwner && asksPhone) {
      return `Deal ${recLabel} ke owner ka naam ${oName || 'N/A'} aur contact number ${oNum || 'N/A'} hai.`;
    }
    if (asksOwner) {
      return `Deal ${recLabel} ke owner ka naam: ${oName || 'database me available nahi hai.'}${oNum ? ` (Contact: ${oNum})` : ''}`;
    }
    if (asksPhone && !asksBuyer && !asksOwner) {
      if (sNum) {
        return `Deal ${recLabel} ke seller ${sName ? `(${sName}) ` : ''}ka phone number ${sNum} hai.`;
      }
      if (bNum) {
        return `Deal ${recLabel} ke buyer ${bName ? `(${bName}) ` : ''}ka phone number ${bNum} hai.`;
      }
      return `Deal ${recLabel} ka contact number database me available nahi hai.`;
    }
    const asksGst = /\b(?:gst|tax|vat)\b/u.test(normalized);
    if (asksProfit || asksGst) {
      const netProfit = typeof item.netProfit === 'number'
        ? `₹${item.netProfit.toLocaleString('en-IN')}`
        : (item.netProfit !== null && item.netProfit !== undefined ? `₹${item.netProfit}` : 'N/A');
      const profitAfterGst = typeof item.netProfitAfterGst === 'number'
        ? `₹${item.netProfitAfterGst.toLocaleString('en-IN')}`
        : (item.netProfitAfterGst !== null && item.netProfitAfterGst !== undefined ? `₹${item.netProfitAfterGst}` : 'N/A');
      const gstRate = item.gstRatePercent !== null && item.gstRatePercent !== undefined ? `${item.gstRatePercent}%` : 'N/A';
      const sell = typeof item.sellAmount === 'number' ? `₹${item.sellAmount.toLocaleString('en-IN')}` : 'N/A';
      const purchase = typeof item.purchaseAmount === 'number' ? `₹${item.purchaseAmount.toLocaleString('en-IN')}` : 'N/A';
      const exp = typeof item.expenses === 'number' ? `₹${item.expenses.toLocaleString('en-IN')}` : 'N/A';
      const buyerPart = bName ? `${bName} ko bechi gayi machine` : `Deal ${recLabel}`;
      return `${buyerPart} me hume:\n- Net Profit (Gross): ${netProfit}\n- GST Rate: ${gstRate}\n- Net Profit (After GST): ${profitAfterGst}\n- Sell Price: ${sell}\n- Purchase Price: ${purchase}\n- Expenses: ${exp}`;
    }
    return null;
  }

  // Multiple items
  const asksGst = /\b(?:gst|tax|vat)\b/u.test(normalized);
  if (asksProfit || asksGst) {
    const lines = items.map((item, idx) => {
      const rec = text(item.recordNumber) || text(item.vehicleNumber) || `Record ${idx + 1}`;
      const buyer = text(item.purchaserName) || 'Buyer';
      const profit = typeof item.netProfit === 'number' ? `₹${item.netProfit.toLocaleString('en-IN')}` : (typeof item.netProfitAfterGst === 'number' ? `₹${item.netProfitAfterGst.toLocaleString('en-IN')}` : 'N/A');
      const gst = item.gstRatePercent !== null && item.gstRatePercent !== undefined ? `${item.gstRatePercent}%` : 'N/A';
      return `${idx + 1}. Deal ${rec} (${buyer}): Net Profit ${profit}, GST ${gst}`;
    });
    return `Matching sold deals me profit details ye hain:\n${lines.join('\n')}`;
  }
  if (asksVehicleNumber) {
    const numbers = items.map((item) => text(item.vehicleNumber)).filter(Boolean);
    return `Sold vehicle module me vehicle registration numbers: ${numbers.join(', ') || 'N/A'}`;
  }
  if (asksPhone && !asksBuyer && !asksOwner) {
    const lines = items.map((item, idx) => {
      const rec = text(item.recordNumber) || text(item.vehicleNumber) || `Record ${idx + 1}`;
      const name = text(item.sellerName) || 'N/A';
      const phone = text(item.sellerNumber) || 'N/A';
      return `${idx + 1}. Deal ${rec}: Seller ${name} - Contact: ${phone}`;
    });
    return `Sold vehicle module me deals ke seller contact numbers:\n${lines.join('\n')}`;
  }
  if (asksSeller) {
    const lines = items.map((item, idx) => {
      const rec = text(item.recordNumber) || text(item.vehicleNumber) || `Record ${idx + 1}`;
      const name = text(item.sellerName) || 'N/A';
      const phone = text(item.sellerNumber);
      return `${idx + 1}. Deal ${rec}: ${name}${phone ? ` (Contact: ${phone})` : ''}`;
    });
    return `Sold vehicle module me deals ke seller details ye hain:\n${lines.join('\n')}`;
  }
  if (asksBuyer) {
    const lines = items.map((item, idx) => {
      const rec = text(item.recordNumber) || text(item.vehicleNumber) || `Record ${idx + 1}`;
      const name = text(item.purchaserName) || text(item.buyerName) || 'N/A';
      const phone = text(item.purchaserNumber) || text(item.buyerPhone);
      return `${idx + 1}. Deal ${rec}: ${name}${phone ? ` (Contact: ${phone})` : ''}`;
    });
    return `Sold vehicle module me deals ke buyer/purchaser details ye hain:\n${lines.join('\n')}`;
  }

  return null;
};
