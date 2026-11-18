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
    return null;
  }

  // Multiple items
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
