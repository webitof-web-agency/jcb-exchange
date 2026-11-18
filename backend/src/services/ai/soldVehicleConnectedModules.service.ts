type Row = Record<string, unknown>;

type ModuleStatus = 'VERIFIED' | 'NOT_LINKED' | 'MISMATCH' | 'PARTIAL';

type ConnectedListing = {
  id: string | null;
  partnerId: string | null;
  partner?: Row | null;
  paymentSubmissions: Row[];
};

type ConnectedLead = Row & {
  id: string;
  listingId?: string | null;
  wonSellAccountId?: string | null;
  customerId?: string | null;
  dealerId?: string | null;
  customer?: Row | null;
  dealer?: Row | null;
  owner?: Row | null;
  followUps?: Row[];
};

export type SoldVehicleConnectedModulesInput = {
  dealId: string;
  listingId: string | null;
  listing: ConnectedListing | null;
  crmLeads: ConnectedLead[];
  rto: (Row & { transferTasks?: Row[] }) | null;
  finance: {
    vouchers: Row[];
    documents: Row[];
    dealExtension: Row | null;
    schedules: Row[];
    writeOffs: Row[];
    partyLinks: Row[];
  };
  documents: { accountDocuments: Row[]; deedWorkflows: Row[]; listingMedia: Row[]; rtoTaskDocuments: Row[] };
  websiteAdvances: { submissions: Row[]; linkedReceipts: Row[] };
  communications: { whatsapp: Row[]; sms: Row[] };
};

const text = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null;
const rowId = (value: unknown): string | null => text((value as Row | null)?.id);
const same = (left: unknown, right: unknown): boolean => Boolean(left && right && left === right);

const duplicateCount = (rows: Row[]) => {
  const seen = new Set<string>();
  let count = 0;
  for (const row of rows) {
    const id = rowId(row);
    if (!id) continue;
    if (seen.has(id)) count += 1;
    seen.add(id);
  }
  return count;
};

const uniqueById = (rows: Row[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = rowId(row);
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const relation = (source: string, target: string, key: string | null, status: ModuleStatus) => ({
  source,
  target,
  key,
  status,
});

const exactRows = (rows: Row[], key: string, expected: string, label: string, warnings: string[]) => {
  const valid = rows.filter((row) => same(row[key], expected));
  const wrong = rows.filter((row) => !same(row[key], expected));
  for (const row of wrong) warnings.push(`${label} ${key}=${text(row[key]) ?? 'null'} does not match deal ${expected}; excluded.`);
  return { rows: uniqueById(valid), wrongCount: wrong.length };
};

const communicationRows = (rows: Row[], dealId: string, paymentIds: Set<string>, label: string, warnings: string[]) => {
  const valid = rows.filter((row) => {
    const type = text(row.relatedEntityType);
    const id = text(row.relatedEntityId);
    return (type === 'SELL_ACCOUNT' && id === dealId) || (type === 'SELL_ACCOUNT_PAYMENT' && Boolean(id && paymentIds.has(id)));
  });
  for (const row of rows.filter((candidate) => !valid.includes(candidate))) warnings.push(`${label} log ${rowId(row) ?? 'unknown'} points to an unverified entity and was excluded.`);
  return uniqueById(valid);
};

/**
 * Builds the connected-module graph for one exact Sold Vehicle deal.
 * Every returned row is accepted only when its stored relationship key matches the canonical deal/listing/payment key.
 */
export const buildSoldVehicleConnectedModules = (input: SoldVehicleConnectedModulesInput) => {
  const warnings: string[] = [];
  const listing = input.listing;
  let wrongRecordsExcluded = 0;
  const duplicateRecordsExcluded = [
    input.crmLeads,
    input.finance.vouchers,
    input.finance.documents,
    input.finance.schedules,
    input.finance.writeOffs,
    input.communications.whatsapp,
    input.communications.sms,
  ].reduce((total, rows) => total + duplicateCount(rows), 0);

  const listingStatus: ModuleStatus = !input.listingId ? 'NOT_LINKED' : !listing ? 'NOT_LINKED' : same(listing.id, input.listingId) ? 'VERIFIED' : 'MISMATCH';
  if (listingStatus === 'MISMATCH') {
    warnings.push(`Listing id ${text(listing?.id) ?? 'null'} does not match SellAccount.listingId ${input.listingId}; listing record excluded.`);
    wrongRecordsExcluded += 1;
  }
  const verifiedListing = listingStatus === 'VERIFIED' ? listing : null;

  const exactLeads = input.crmLeads.filter((lead) => same(lead.wonSellAccountId, input.dealId));
  const wrongLeads = input.crmLeads.filter((lead) => !same(lead.wonSellAccountId, input.dealId));
  wrongRecordsExcluded += wrongLeads.length;
  for (const lead of wrongLeads) warnings.push(`CRM lead ${lead.id} wonSellAccountId=${text(lead.wonSellAccountId) ?? 'null'} does not match deal ${input.dealId}; excluded.`);
  const crmLeads = uniqueById(exactLeads);
  const crmRecords = crmLeads.map((lead) => {
    const customerId = text(lead.customerId);
    const dealerId = text(lead.dealerId);
    const customer = customerId && same(rowId(lead.customer), customerId) ? lead.customer ?? null : null;
    const dealer = dealerId && same(rowId(lead.dealer), dealerId) ? lead.dealer ?? null : null;
    if (customerId && !customer) warnings.push(`CRM lead ${lead.id} customerId=${customerId} has no matching User row.`);
    if (dealerId && !dealer) warnings.push(`CRM lead ${lead.id} dealerId=${dealerId} has no matching User row.`);
    return { lead, customer, dealer, owner: lead.owner ?? null, followUps: Array.isArray(lead.followUps) ? uniqueById(lead.followUps) : [] };
  });

  const listingPartner = verifiedListing?.partner && same(rowId(verifiedListing.partner), verifiedListing.partnerId)
    ? { kind: 'LISTING_PARTNER', user: verifiedListing.partner, verifiedKey: `Listing.partnerId=${verifiedListing.partnerId}` }
    : null;
  if (verifiedListing?.partnerId && !listingPartner) {
    warnings.push(`Listing.partnerId=${verifiedListing.partnerId} has no matching User partner row; partner record excluded.`);
    wrongRecordsExcluded += 1;
  }
  const crmDealers = crmRecords.filter((item) => item.dealer).map((item) => ({ kind: 'CRM_DEALER', user: item.dealer, verifiedKey: `Lead.dealerId=${rowId(item.dealer)}` }));
  const partnerRecords = uniqueById([...listingPartner ? [{ id: `listing:${rowId(listingPartner.user)}`, ...listingPartner }] : [], ...crmDealers.map((item) => ({ id: `crm:${rowId(item.user)}`, ...item }))]);

  const rtoStatus: ModuleStatus = !input.rto ? 'NOT_LINKED' : same(input.rto.sellAccountId, input.dealId) ? 'VERIFIED' : 'MISMATCH';
  if (rtoStatus === 'MISMATCH') {
    warnings.push(`RTO record ${rowId(input.rto)} sellAccountId=${text(input.rto?.sellAccountId) ?? 'null'} does not match deal ${input.dealId}; excluded.`);
    wrongRecordsExcluded += 1;
  }
  const verifiedRto = rtoStatus === 'VERIFIED' ? input.rto : null;
  if (verifiedRto?.listingId && input.listingId && !same(verifiedRto.listingId, input.listingId)) warnings.push(`RTO record ${rowId(verifiedRto)} listingId does not match the canonical listing; RTO deal key remains authoritative.`);
  const rtoTasks = verifiedRto && Array.isArray(verifiedRto.transferTasks) ? uniqueById(verifiedRto.transferTasks) : [];

  const financeParts = [
    exactRows(input.finance.vouchers, 'sellAccountId', input.dealId, 'Finance voucher', warnings),
    exactRows(input.finance.documents, 'sellAccountId', input.dealId, 'Finance document', warnings),
    input.finance.dealExtension ? exactRows([input.finance.dealExtension], 'sellAccountId', input.dealId, 'Finance deal extension', warnings) : { rows: [], wrongCount: 0 },
    exactRows(input.finance.schedules, 'sellAccountId', input.dealId, 'Finance payment schedule', warnings),
    exactRows(input.finance.writeOffs, 'sellAccountId', input.dealId, 'Finance write-off', warnings),
  ];
  wrongRecordsExcluded += financeParts.reduce((total, part) => total + part.wrongCount, 0);
  const financeRows = financeParts.flatMap((part) => part.rows);
  const financeStatus: ModuleStatus = financeRows.length > 0 ? 'VERIFIED' : 'NOT_LINKED';
  const partyLinks = input.finance.partyLinks.filter((link) => ['SELL_ACCOUNT_SELLER', 'SELL_ACCOUNT_PURCHASER', 'SELL_ACCOUNT_BROKER'].includes(text(link.linkType) ?? '') && same(link.linkId, input.dealId));
  const accountingVouchers = financeParts[0]!.rows;
  const accountingDocuments = financeParts[1]!.rows;
  const accountingStatus: ModuleStatus = accountingVouchers.length || accountingDocuments.length ? 'VERIFIED' : 'NOT_LINKED';
  if (!accountingVouchers.length && !accountingDocuments.length) warnings.push(`No accounting voucher/document is linked through sellAccountId=${input.dealId}.`);

  const followUps = crmRecords.flatMap((item) => item.followUps);
  const taskRecords = [...rtoTasks, ...followUps];
  const documents = [
    ...input.documents.accountDocuments.map((row) => ({ source: 'SellAccount.documents', row })),
    ...input.documents.deedWorkflows.map((row) => ({ source: 'SellAccountDeedWorkflow.sellAccountId', row })),
    ...input.documents.listingMedia.map((row) => ({ source: 'Listing.media.listingId', row })),
    ...input.documents.rtoTaskDocuments.map((row) => ({ source: 'RtoTransferTask.documents.rtoRecordId', row })),
  ];
  const linkedReceipts = input.websiteAdvances.linkedReceipts;
  const paymentIds = new Set(linkedReceipts.map((row) => text(row.paymentId)).filter((value): value is string => Boolean(value)));
  const advanceLinks = input.websiteAdvances.submissions.map((submission) => {
    const matched = linkedReceipts.find((receipt) => same(receipt.listingPaymentId, submission.id));
    if (input.listingId && !same(submission.listingId, input.listingId)) warnings.push(`Website advance ${rowId(submission)} listingId=${text(submission.listingId) ?? 'null'} does not match listing ${input.listingId}; excluded.`);
    return { listingPaymentId: rowId(submission), receiptPaymentId: matched ? rowId(matched) ?? text(matched.paymentId) : null, matched: Boolean(matched), submission };
  }).filter((link) => link.listingPaymentId && (!input.listingId || same(link.submission.listingId, input.listingId)));
  const websiteStatus: ModuleStatus = input.listingId && advanceLinks.length ? 'VERIFIED' : input.listingId ? 'PARTIAL' : 'NOT_LINKED';
  const whatsapp = communicationRows(input.communications.whatsapp, input.dealId, paymentIds, 'WhatsApp', warnings);
  const sms = communicationRows(input.communications.sms, input.dealId, paymentIds, 'SMS', warnings);
  const communicationStatus: ModuleStatus = whatsapp.length || sms.length ? 'VERIFIED' : 'NOT_LINKED';

  const modules = {
    listingsInventory: { status: listingStatus, verifiedKeys: listingStatus === 'VERIFIED' ? [relation('SellAccount.listingId', 'Listing.id', input.listingId, listingStatus)] : [], records: verifiedListing ? [verifiedListing] : [], warnings: listingStatus === 'MISMATCH' ? ['listingId mismatch'] : [] },
    crmCustomer: { status: crmRecords.length ? 'VERIFIED' as const : 'NOT_LINKED' as const, verifiedKeys: crmRecords.map((item) => relation('Lead.wonSellAccountId', 'SellAccount.id', text(item.lead.wonSellAccountId), 'VERIFIED')), records: crmRecords, warnings: [] as string[] },
    partnersDealers: { status: partnerRecords.length ? 'VERIFIED' as const : 'NOT_LINKED' as const, verifiedKeys: partnerRecords.map((item) => relation(item.kind === 'LISTING_PARTNER' ? 'Listing.partnerId' : 'Lead.dealerId', 'User.id', rowId(item.user), 'VERIFIED')), records: partnerRecords, warnings: [] as string[] },
    rtoWork: { status: rtoStatus, verifiedKeys: rtoStatus === 'VERIFIED' ? [relation('VehicleRtoRecord.sellAccountId', 'SellAccount.id', input.dealId, rtoStatus)] : [], records: verifiedRto ? [verifiedRto] : [], tasks: rtoTasks, warnings: [] as string[] },
    financeHub: { status: financeStatus, verifiedKeys: financeRows.map((row) => relation('Finance.*.sellAccountId', 'SellAccount.id', text(row.sellAccountId), 'VERIFIED')), records: financeRows, partyLinks, warnings: [] as string[] },
    accountingTally: { status: accountingStatus, verifiedKeys: [...accountingVouchers, ...accountingDocuments].map((row) => relation('FinVoucher/FinDocument.sellAccountId', 'SellAccount.id', text(row.sellAccountId), 'VERIFIED')), vouchers: accountingVouchers, documents: accountingDocuments, tallyExportSource: { sourceType: 'SELL_ACCOUNT', sourceId: input.dealId, derivedFromVerifiedFinanceRows: Boolean(accountingVouchers.length || accountingDocuments.length) }, warnings: [] as string[] },
    tasks: { status: taskRecords.length ? 'VERIFIED' as const : 'NOT_LINKED' as const, verifiedKeys: [...rtoTasks.map(() => relation('RtoTransferTask.rtoRecordId', 'VehicleRtoRecord.id', rowId(verifiedRto), 'VERIFIED')), ...followUps.map((row) => relation('CrmFollowUp.leadId', 'Lead.id', text(row.leadId), 'VERIFIED'))], records: taskRecords, warnings: [] as string[] },
    vehicleDocuments: { status: documents.length ? 'VERIFIED' as const : 'NOT_LINKED' as const, verifiedKeys: documents.map((item) => relation(item.source, item.source.includes('Listing') ? 'Listing.id' : item.source.includes('Rto') ? 'VehicleRtoRecord.id' : 'SellAccount.id', item.source.includes('Listing') ? input.listingId : item.source.includes('Rto') ? rowId(verifiedRto) : input.dealId, 'VERIFIED')), records: documents, warnings: [] as string[] },
    websiteAdvances: { status: websiteStatus, verifiedKeys: input.listingId ? [relation('ListingPaymentSubmission.listingId', 'Listing.id', input.listingId, websiteStatus)] : [], submissions: input.websiteAdvances.submissions, links: advanceLinks, warnings: [] as string[] },
    whatsappSms: { status: communicationStatus, verifiedKeys: [...whatsapp, ...sms].map((row) => relation(`${row.relatedEntityType}.relatedEntityId`, row.relatedEntityType === 'SELL_ACCOUNT' ? 'SellAccount.id' : 'SellAccountPayment.id', text(row.relatedEntityId), 'VERIFIED')), records: [...whatsapp, ...sms], whatsapp, sms, warnings: [] as string[] },
  };
  const statuses = Object.values(modules).map((module) => module.status);
  return {
    canonicalDealId: input.dealId,
    relationshipGraph: Object.values(modules).flatMap((module) => module.verifiedKeys),
    modules,
    warnings,
    integrity: {
      allRelationshipsVerified: statuses.every((status) => status === 'VERIFIED' || status === 'NOT_LINKED' || status === 'PARTIAL') && wrongRecordsExcluded === 0 && warnings.length === 0,
      wrongRecordsExcluded,
      duplicateRecordsExcluded,
    },
  };
};

export type SoldVehicleConnectedModules = ReturnType<typeof buildSoldVehicleConnectedModules>;
