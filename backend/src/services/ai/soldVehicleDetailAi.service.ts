import { reconcileSoldVehicleFinancials } from './soldVehicleFinancialReconciliation.service';
import { buildSoldVehicleOperationalAudit } from './soldVehicleOperationalAudit.service';
import { buildSoldVehicleConnectedModules } from './soldVehicleConnectedModules.service';

type DetailDb = {
  sellAccount: { findFirst: (args: any) => Promise<any> };
  finVoucher: { findMany: (args: any) => Promise<any[]> };
  finDocument: { findMany: (args: any) => Promise<any[]> };
  finVehicleDealExt: { findUnique: (args: any) => Promise<any> };
  finPaymentSchedule: { findMany: (args: any) => Promise<any[]> };
  finWriteOff: { findMany: (args: any) => Promise<any[]> };
  finPartyLink?: { findMany: (args: any) => Promise<any[]> };
  user?: { findMany: (args: any) => Promise<any[]> };
  sellAccountLockHistory?: { findMany: (args: any) => Promise<any[]> };
  whatsAppMessageLog?: { findMany: (args: any) => Promise<any[]> };
  smsMessageLog?: { findMany: (args: any) => Promise<any[]> };
};

export type SoldVehicleDetailArguments = {
  dealId?: string;
  recordNumber?: string;
};

export class SoldVehicleDetailError extends Error {
  constructor(message: string, public readonly code: 'IDENTIFIER_REQUIRED' | 'IDENTIFIER_INVALID') {
    super(message);
    this.name = 'SoldVehicleDetailError';
  }
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const numeric = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && value && 'toNumber' in value && typeof value.toNumber === 'function') {
    const numberValue = (value.toNumber as () => number)();
    return Number.isFinite(numberValue) ? numberValue : 0;
  }
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const numericOrNull = (value: unknown): number | null => value === null || value === undefined ? null : numeric(value);

const iso = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
};

const valueOrNull = (value: unknown): unknown => value === undefined ? null : value;

const SECRET_KEY = /(?:token|secret|password|passcode|api[_-]?key|private[_-]?key|authorization|signature|credential|cookie|hash|ciphertext|signingurl|fileurl|documenturl|receipturl|url|uri)/iu;

const safeJson = (value: unknown): unknown => {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(safeJson);
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) continue;
    output[key] = safeJson(child);
  }
  return output;
};

const safeFile = (value: unknown): Record<string, unknown> => {
  const file = asRecord(value);
  return {
    ...(file.id !== undefined ? { id: valueOrNull(file.id) } : {}),
    fileName: valueOrNull(file.fileName ?? file.name),
    mimeType: valueOrNull(file.mimeType ?? file.type),
    size: valueOrNull(file.size),
    uploadedAt: iso(file.uploadedAt ?? file.createdAt),
    slot: valueOrNull(file.slot),
    documentType: valueOrNull(file.documentType ?? file.type),
    hasFile: Boolean(file.fileUrl ?? file.url ?? file.fileName ?? file.name),
  };
};

const safeDocumentCollection = (value: unknown): unknown[] => {
  if (!value) return [];
  if (!Array.isArray(value) && typeof value === 'object') {
    const record = asRecord(value);
    const looksLikeFile = ['fileName', 'originalName', 'fileUrl', 'url', 'mimeType', 'size', 'uploadedAt'].some((key) => key in record);
    if (!looksLikeFile) return Object.entries(record).map(([documentType, item]) => ({ ...safeFile(item), documentType }));
  }
  if (!Array.isArray(value)) return [safeFile(value)];
  return value.map((item) => (item && typeof item === 'object' ? safeFile(item) : { value: item }));
};

const safePayment = (value: unknown) => {
  const payment = asRecord(value);
  return {
    id: valueOrNull(payment.id),
    side: valueOrNull(payment.side),
    amount: numeric(payment.amount),
    paymentDate: iso(payment.paymentDate),
    method: valueOrNull(payment.method),
    reference: valueOrNull(payment.reference),
    drawnOn: valueOrNull(payment.drawnOn),
    note: valueOrNull(payment.note),
    receiptStatus: valueOrNull(payment.receiptStatus),
    issuedAt: iso(payment.issuedAt),
    issuedById: valueOrNull(payment.issuedById),
    cancelledAt: iso(payment.cancelledAt),
    cancelledById: valueOrNull(payment.cancelledById),
    cancelReason: valueOrNull(payment.cancelReason),
    receiptNumber: valueOrNull(payment.receiptNumber),
    listingPaymentId: valueOrNull(payment.listingPaymentId),
    receiptGeneratedAt: iso(payment.receiptGeneratedAt),
    receiptDelivery: safeJson(payment.receiptDelivery),
    createdById: valueOrNull(payment.createdById),
    createdAt: iso(payment.createdAt),
  };
};

const safeRefund = (value: unknown) => {
  const refund = asRecord(value);
  return {
    id: valueOrNull(refund.id),
    refundNumber: valueOrNull(refund.refundNumber),
    status: valueOrNull(refund.status),
    reason: valueOrNull(refund.reason),
    amount: numeric(refund.amount),
    forfeitAmount: numeric(refund.forfeitAmount),
    method: valueOrNull(refund.method),
    reference: valueOrNull(refund.reference),
    drawnOn: valueOrNull(refund.drawnOn),
    refundDate: iso(refund.refundDate),
    note: valueOrNull(refund.note),
    requestedById: valueOrNull(refund.requestedById),
    approvedById: valueOrNull(refund.approvedById),
    approvedAt: iso(refund.approvedAt),
    rejectedById: valueOrNull(refund.rejectedById),
    rejectedAt: iso(refund.rejectedAt),
    rejectReason: valueOrNull(refund.rejectReason),
    paidById: valueOrNull(refund.paidById),
    paidAt: iso(refund.paidAt),
    createdAt: iso(refund.createdAt),
    updatedAt: iso(refund.updatedAt),
  };
};

const safeRto = (value: unknown) => {
  if (!value) return null;
  const rto = asRecord(value);
  return {
    record: {
      id: valueOrNull(rto.id), listingId: valueOrNull(rto.listingId), sellAccountId: valueOrNull(rto.sellAccountId),
      customerName: valueOrNull(rto.customerName), customerNumber: valueOrNull(rto.customerNumber), vehicleNumber: valueOrNull(rto.vehicleNumber),
      brandName: valueOrNull(rto.brandName), vehicleType: valueOrNull(rto.vehicleType), vehicleModel: valueOrNull(rto.vehicleModel),
      hirePurchaseStatus: valueOrNull(rto.hirePurchaseStatus), financerName: valueOrNull(rto.financerName),
      taxStatus: valueOrNull(rto.taxStatus), taxValidUntil: iso(rto.taxValidUntil), fitnessStatus: valueOrNull(rto.fitnessStatus), fitnessValidUntil: iso(rto.fitnessValidUntil),
      insuranceStatus: valueOrNull(rto.insuranceStatus), insuranceValidUntil: iso(rto.insuranceValidUntil), pucStatus: valueOrNull(rto.pucStatus), pucValidUntil: iso(rto.pucValidUntil),
      hsrpStatus: valueOrNull(rto.hsrpStatus), hsrpNumber: valueOrNull(rto.hsrpNumber), sellerName: valueOrNull(rto.sellerName), sellerNumber: valueOrNull(rto.sellerNumber),
      purchaserName: valueOrNull(rto.purchaserName), purchaserNumber: valueOrNull(rto.purchaserNumber), rtoOffice: valueOrNull(rto.rtoOffice),
      rtoAgentName: valueOrNull(rto.rtoAgentName), rtoAgentState: valueOrNull(rto.rtoAgentState), rtoAgentCity: valueOrNull(rto.rtoAgentCity), rtoAgentNumber: valueOrNull(rto.rtoAgentNumber),
      rtoExpenses: numeric(rto.rtoExpenses), rtoExpensesAdvance: numeric(rto.rtoExpensesAdvance), documentSendDate: iso(rto.documentSendDate), rtoStatus: valueOrNull(rto.rtoStatus),
      isLocked: Boolean(rto.isLocked), lockedAt: iso(rto.lockedAt), noteSheet: valueOrNull(rto.noteSheet), vehicleMaintenanceCost: numeric(rto.vehicleMaintenanceCost), hourRunning: valueOrNull(rto.hourRunning),
      complianceSnapshot: safeJson(rto.complianceSnapshot), complianceCheckedAt: iso(rto.complianceCheckedAt), createdAt: iso(rto.createdAt), updatedAt: iso(rto.updatedAt),
    },
    transferTasks: Array.isArray(rto.transferTasks) ? rto.transferTasks.map((item) => {
      const task = asRecord(item);
      return { id: valueOrNull(task.id), taskKey: valueOrNull(task.taskKey), label: valueOrNull(task.label), isOptional: Boolean(task.isOptional), sortOrder: valueOrNull(task.sortOrder), status: valueOrNull(task.status), remark: valueOrNull(task.remark), documents: safeDocumentCollection(task.documents), createdAt: iso(task.createdAt), updatedAt: iso(task.updatedAt) };
    }) : [],
    statusLogs: Array.isArray(rto.statusLogs) ? rto.statusLogs.map((item) => {
      const log = asRecord(item);
      return { id: valueOrNull(log.id), oldStatus: valueOrNull(log.oldStatus), newStatus: valueOrNull(log.newStatus), remark: valueOrNull(log.remark), createdAt: iso(log.createdAt) };
    }) : [],
  };
};

const safeDeedWorkflow = (value: unknown) => {
  const deed = asRecord(value);
  return { id: valueOrNull(deed.id), side: valueOrNull(deed.side), status: valueOrNull(deed.status), sourceDocument: safeJson(deed.sourceDocument), sourceLinkExpiresAt: iso(deed.sourceLinkExpiresAt), executionStateCode: valueOrNull(deed.executionStateCode), executionStateName: valueOrNull(deed.executionStateName), articleId: valueOrNull(deed.articleId), stampDuty: valueOrNull(deed.stampDuty), considerationAmount: valueOrNull(deed.considerationAmount), signerName: valueOrNull(deed.signerName), signerMobile: valueOrNull(deed.signerMobile), signerEmail: valueOrNull(deed.signerEmail), providerEnvironment: valueOrNull(deed.providerEnvironment), providerStatus: valueOrNull(deed.providerStatus), providerChargeStatus: valueOrNull(deed.providerChargeStatus), providerChargedAmountPaise: valueOrNull(deed.providerChargedAmountPaise), lastErrorCode: valueOrNull(deed.lastErrorCode), lastErrorMessage: valueOrNull(deed.lastErrorMessage), signedAt: iso(deed.signedAt), createdAt: iso(deed.createdAt), updatedAt: iso(deed.updatedAt) };
};

const safeListing = (value: unknown) => {
  if (!value) return null;
  const listing = asRecord(value);
  const partner = asRecord(listing.partner);
  const partnerProfile = asRecord(partner.partnerProfile);
  const saleRecord = asRecord(listing.saleRecord);
  return {
    id: valueOrNull(listing.id), partnerId: valueOrNull(listing.partnerId), title: valueOrNull(listing.title), ownerName: valueOrNull(listing.ownerName),
    category: listing.category ? { id: valueOrNull(asRecord(listing.category).id), name: valueOrNull(asRecord(listing.category).name) } : null,
    brand: listing.brand ? { id: valueOrNull(asRecord(listing.brand).id), name: valueOrNull(asRecord(listing.brand).name) } : null,
    model: listing.model ? { id: valueOrNull(asRecord(listing.model).id), name: valueOrNull(asRecord(listing.model).name), brandId: valueOrNull(asRecord(listing.model).brandId) } : null,
    price: numeric(listing.price), isNegotiable: Boolean(listing.isNegotiable), manufacturingYear: valueOrNull(listing.manufacturingYear), operatingHours: valueOrNull(listing.operatingHours),
    location: { state: valueOrNull(listing.locationState), city: valueOrNull(listing.locationCity), address: valueOrNull(listing.address) }, condition: valueOrNull(listing.condition),
    description: valueOrNull(listing.description), additionalDescription: valueOrNull(listing.additionalDescription), grossPower: valueOrNull(listing.grossPower), engineNumber: valueOrNull(listing.engineNumber),
    registrationNumber: valueOrNull(listing.registrationNumberKey), chassisNumber: valueOrNull(listing.chassisNumberKey), status: valueOrNull(listing.status), soldAt: iso(listing.soldAt), views: valueOrNull(listing.views),
    adminMarginAmount: numeric(listing.adminMarginAmount), adminExpenseAmount: numeric(listing.adminExpenseAmount), adminExpenseBreakdown: safeJson(listing.adminExpenseBreakdown), createdAt: iso(listing.createdAt), updatedAt: iso(listing.updatedAt),
    partner: { id: valueOrNull(partner.id), name: valueOrNull(partner.name), mobile: valueOrNull(partner.mobile), email: valueOrNull(partner.email), profile: { id: valueOrNull(partnerProfile.id), partnerCode: valueOrNull(partnerProfile.partnerCode), businessName: valueOrNull(partnerProfile.businessName), partnerType: valueOrNull(partnerProfile.partnerType), accountStatus: valueOrNull(partnerProfile.accountStatus), kycStatus: valueOrNull(partnerProfile.kycStatus) } },
    saleRecord: listing.saleRecord ? { id: valueOrNull(saleRecord.id), buyerName: valueOrNull(saleRecord.buyerName), buyerPhone: valueOrNull(saleRecord.buyerPhone), buyerCity: valueOrNull(saleRecord.buyerCity), buyerState: valueOrNull(saleRecord.buyerState), soldPrice: numeric(saleRecord.soldPrice), soldAt: iso(saleRecord.soldAt), invoiceNo: valueOrNull(saleRecord.invoiceNo), notes: valueOrNull(saleRecord.notes), createdAt: iso(saleRecord.createdAt), updatedAt: iso(saleRecord.updatedAt) } : null,
    media: Array.isArray(listing.media) ? listing.media.map((item) => { const media = asRecord(item); return { id: valueOrNull(media.id), type: valueOrNull(media.type), slot: valueOrNull(media.slot), isFeatured: Boolean(media.isFeatured), hasFile: Boolean(media.url), aiAnalysis: safeJson(media.aiAnalysis), aiAnalyzedAt: iso(media.aiAnalyzedAt), createdAt: iso(media.createdAt) }; }) : [],
    paymentSubmissions: Array.isArray(listing.paymentSubmissions) ? listing.paymentSubmissions.map((item) => { const payment = asRecord(item); return { id: valueOrNull(payment.id), listingId: valueOrNull(payment.listingId), buyerId: valueOrNull(payment.buyerId), partnerId: valueOrNull(payment.partnerId), method: valueOrNull(payment.method), status: valueOrNull(payment.status), amount: numeric(payment.amount), customerCity: valueOrNull(payment.customerCity), customerState: valueOrNull(payment.customerState), transactionRef: valueOrNull(payment.transactionRef), hasReceipt: Boolean(payment.receiptUrl), submittedAt: iso(payment.submittedAt), createdAt: iso(payment.createdAt), updatedAt: iso(payment.updatedAt) }; }) : [],
    leads: Array.isArray(listing.leads) ? listing.leads.map((item) => { const lead = asRecord(item); const customer = asRecord(lead.customer); const dealer = asRecord(lead.dealer); const owner = asRecord(lead.owner); return { id: valueOrNull(lead.id), listingId: valueOrNull(lead.listingId), customerId: valueOrNull(lead.customerId), dealerId: valueOrNull(lead.dealerId), ownerId: valueOrNull(lead.ownerId), status: valueOrNull(lead.status), enquiryType: valueOrNull(lead.enquiryType), source: valueOrNull(lead.source), leadType: valueOrNull(lead.leadType), wonSellAccountId: valueOrNull(lead.wonSellAccountId), score: valueOrNull(lead.score), createdAt: iso(lead.createdAt), updatedAt: iso(lead.updatedAt), customer: { id: valueOrNull(customer.id), name: valueOrNull(customer.name), mobile: valueOrNull(customer.mobile), email: valueOrNull(customer.email), city: valueOrNull(customer.city), state: valueOrNull(customer.state) }, dealer: { id: valueOrNull(dealer.id), name: valueOrNull(dealer.name), mobile: valueOrNull(dealer.mobile), email: valueOrNull(dealer.email), role: valueOrNull(dealer.role) }, owner: { id: valueOrNull(owner.id), name: valueOrNull(owner.name), email: valueOrNull(owner.email), role: valueOrNull(owner.role) }, followUps: Array.isArray(lead.followUps) ? lead.followUps.map((followUp) => { const item = asRecord(followUp); return { id: valueOrNull(item.id), leadId: valueOrNull(item.leadId), contactUserId: valueOrNull(item.contactUserId), ownerId: valueOrNull(item.ownerId), type: valueOrNull(item.type), status: valueOrNull(item.status), dueAt: iso(item.dueAt), title: valueOrNull(item.title), notes: valueOrNull(item.notes), completedAt: iso(item.completedAt) }; }) : [] }; }) : [],
  };
};

const safeVoucher = (value: unknown) => {
  const voucher = asRecord(value);
  return { id: valueOrNull(voucher.id), number: valueOrNull(voucher.number), type: valueOrNull(voucher.type), date: iso(voucher.date), status: valueOrNull(voucher.status), narration: valueOrNull(voucher.narration), reference: valueOrNull(voucher.reference), paymentMethod: valueOrNull(voucher.paymentMethod), partyId: valueOrNull(voucher.partyId), sellAccountId: valueOrNull(voucher.sellAccountId), totalAmount: numeric(voucher.totalAmount), sourceType: valueOrNull(voucher.sourceType), sourceId: valueOrNull(voucher.sourceId), sourceEvent: valueOrNull(voucher.sourceEvent), createdAt: iso(voucher.createdAt), lines: Array.isArray(voucher.lines) ? voucher.lines.map((item) => { const line = asRecord(item); return { id: valueOrNull(line.id), lineNo: valueOrNull(line.lineNo), accountId: valueOrNull(line.accountId), partyId: valueOrNull(line.partyId), sellAccountId: valueOrNull(line.sellAccountId), debit: numeric(line.debit), credit: numeric(line.credit), narration: valueOrNull(line.narration), billRef: valueOrNull(line.billRef) }; }) : [] };
};

const safeFinanceDocument = (value: unknown) => {
  const document = asRecord(value);
  return { id: valueOrNull(document.id), docType: valueOrNull(document.docType), status: valueOrNull(document.status), number: valueOrNull(document.number), partyDocNumber: valueOrNull(document.partyDocNumber), date: iso(document.date), dueDate: iso(document.dueDate), partyId: valueOrNull(document.partyId), placeOfSupply: valueOrNull(document.placeOfSupply), isIntraState: Boolean(document.isIntraState), isReverseCharge: Boolean(document.isReverseCharge), reason: valueOrNull(document.reason), againstDocumentId: valueOrNull(document.againstDocumentId), againstReference: valueOrNull(document.againstReference), sellAccountId: valueOrNull(document.sellAccountId), notes: valueOrNull(document.notes), subTotal: numeric(document.subTotal), cgst: numeric(document.cgst), sgst: numeric(document.sgst), igst: numeric(document.igst), tdsAmount: numeric(document.tdsAmount), roundOff: numeric(document.roundOff), total: numeric(document.total), voucherId: valueOrNull(document.voucherId), cancelReason: valueOrNull(document.cancelReason), cancelledAt: iso(document.cancelledAt), createdAt: iso(document.createdAt), updatedAt: iso(document.updatedAt), lines: Array.isArray(document.lines) ? document.lines.map((item) => { const line = asRecord(item); return { id: valueOrNull(line.id), lineNo: valueOrNull(line.lineNo), description: valueOrNull(line.description), accountId: valueOrNull(line.accountId), hsnSac: valueOrNull(line.hsnSac), quantity: numeric(line.quantity), rate: numeric(line.rate), discount: numeric(line.discount), taxableValue: numeric(line.taxableValue), gstRate: numeric(line.gstRate), cgst: numeric(line.cgst), sgst: numeric(line.sgst), igst: numeric(line.igst), itcEligible: Boolean(line.itcEligible), sellAccountId: valueOrNull(line.sellAccountId) }; }) : [] };
};

const safeFinanceExt = (value: unknown) => {
  if (!value) return null;
  const item = asRecord(value);
  return { id: valueOrNull(item.id), sellAccountId: valueOrNull(item.sellAccountId), dealMode: valueOrNull(item.dealMode), consignorPartyId: valueOrNull(item.consignorPartyId), consignmentCommission: numeric(item.consignmentCommission), brokerPartyId: valueOrNull(item.brokerPartyId), brokeragePayable: numeric(item.brokeragePayable), brokerageReceivable: numeric(item.brokerageReceivable), brokerageReceivablePartyId: valueOrNull(item.brokerageReceivablePartyId), partnerPartyId: valueOrNull(item.partnerPartyId), partnerShareAmount: numeric(item.partnerShareAmount), notes: valueOrNull(item.notes), createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt) };
};

const safeSchedule = (value: unknown) => { const item = asRecord(value); return { id: valueOrNull(item.id), side: valueOrNull(item.side), partyId: valueOrNull(item.partyId), dueDate: iso(item.dueDate), amount: numeric(item.amount), reference: valueOrNull(item.reference), sellAccountId: valueOrNull(item.sellAccountId), notes: valueOrNull(item.notes), status: valueOrNull(item.status), voucherNumber: valueOrNull(item.voucherNumber), completedAt: iso(item.completedAt), createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt) }; };
const safeWriteOff = (value: unknown) => { const item = asRecord(value); return { id: valueOrNull(item.id), side: valueOrNull(item.side), kind: valueOrNull(item.kind), partyId: valueOrNull(item.partyId), controlAccountId: valueOrNull(item.controlAccountId), counterAccountId: valueOrNull(item.counterAccountId), sellAccountId: valueOrNull(item.sellAccountId), date: iso(item.date), amount: numeric(item.amount), reason: valueOrNull(item.reason), voucherId: valueOrNull(item.voucherId), createdAt: iso(item.createdAt) }; };

const safeCommunicationLog = (value: unknown) => {
  const log = asRecord(value);
  const outbox = asRecord(log.outbox);
  return {
    id: valueOrNull(log.id), eventCode: valueOrNull(log.eventCode), relatedEntityType: valueOrNull(log.relatedEntityType), relatedEntityId: valueOrNull(log.relatedEntityId),
    recipientType: valueOrNull(log.recipientType), recipientPhone: valueOrNull(log.recipientPhone), status: valueOrNull(log.status), errorCode: valueOrNull(log.errorCode), errorMessage: valueOrNull(log.errorMessage),
    createdAt: iso(log.createdAt), sentAt: iso(log.sentAt), deliveredAt: iso(log.deliveredAt), readAt: iso(log.readAt),
    outbox: log.outbox ? { attempts: numeric(outbox.attempts), status: valueOrNull(outbox.status), nextAttemptAt: iso(outbox.nextAttemptAt), processedAt: iso(outbox.processedAt), lastError: valueOrNull(outbox.lastError) } : null,
  };
};

const detailSelect = {
  id: true, recordNumber: true, listingId: true, listingTitle: true, ownerName: true, ownerNumber: true, vehicleNumber: true, chassisNumber: true,
  sellDate: true, purchaserDate: true, sellerDate: true, vehicleType: true, brandName: true, vehicleModel: true, sellerName: true, sellerNumber: true, purchaserName: true, purchaserNumber: true,
  sellerState: true, purchaserState: true, sellerCity: true, purchaserCity: true, sourceType: true, purchaseType: true, saleType: true, purchaseExchangeValue: true, purchaseExchangeVehicle: true,
  saleExchangeValue: true, saleExchangeVehicle: true, brokerName: true, brokerNumber: true, expenseBreakdown: true, purchaseAmount: true, sellAmount: true, expenses: true, balanceAmount: true, netProfit: true, netProfitAfterGst: true, gstRatePercent: true, taxMode: true, marginBasis: true, transferDetails: true, remarks: true, documents: true,
  isDraft: true, draftSavedAt: true, isLocked: true, lockedAt: true, lockedById: true, dealStatus: true, rtoStatusSnapshot: true, completedAt: true, invoiceNumber: true, invoiceGeneratedAt: true, invoiceTokenExpiresAt: true, invoiceSentAt: true, invoiceDelivery: true, cancelledAt: true, cancelledById: true, cancelReason: true, creditNoteNumber: true, creditNoteDate: true, releasedListingId: true, createdById: true, updatedById: true, createdAt: true, updatedAt: true, deletedAt: true,
  payments: { orderBy: { paymentDate: 'asc' }, select: { id: true, side: true, amount: true, paymentDate: true, method: true, reference: true, drawnOn: true, note: true, receiptStatus: true, issuedAt: true, issuedById: true, cancelledAt: true, cancelledById: true, cancelReason: true, receiptNumber: true, listingPaymentId: true, receiptGeneratedAt: true, receiptDelivery: true, createdById: true, createdAt: true } },
  refunds: { orderBy: { createdAt: 'asc' }, select: { id: true, refundNumber: true, status: true, reason: true, amount: true, forfeitAmount: true, method: true, reference: true, drawnOn: true, refundDate: true, note: true, requestedById: true, approvedById: true, approvedAt: true, rejectedById: true, rejectedAt: true, rejectReason: true, paidById: true, paidAt: true, createdAt: true, updatedAt: true } },
  statusHistory: { orderBy: { createdAt: 'asc' }, select: { id: true, oldStatus: true, newStatus: true, reason: true, changedById: true, createdAt: true } },
  deedWorkflows: { orderBy: { createdAt: 'asc' }, select: { id: true, side: true, status: true, sourceDocument: true, sourceLinkExpiresAt: true, executionStateCode: true, executionStateName: true, articleId: true, stampDuty: true, considerationAmount: true, signerName: true, signerMobile: true, signerEmail: true, providerEnvironment: true, providerStatus: true, providerChargeStatus: true, providerChargedAmountPaise: true, lastErrorCode: true, lastErrorMessage: true, signedAt: true, createdAt: true, updatedAt: true } },
  rtoRecord: { select: { id: true, listingId: true, sellAccountId: true, customerName: true, customerNumber: true, vehicleNumber: true, brandName: true, vehicleType: true, vehicleModel: true, hirePurchaseStatus: true, financerName: true, taxStatus: true, taxValidUntil: true, fitnessStatus: true, fitnessValidUntil: true, insuranceStatus: true, insuranceValidUntil: true, pucStatus: true, pucValidUntil: true, hsrpStatus: true, hsrpNumber: true, sellerName: true, sellerNumber: true, purchaserName: true, purchaserNumber: true, rtoOffice: true, rtoAgentName: true, rtoAgentState: true, rtoAgentCity: true, rtoAgentNumber: true, rtoExpenses: true, rtoExpensesAdvance: true, documentSendDate: true, rtoStatus: true, isLocked: true, lockedAt: true, lockedById: true, noteSheet: true, vehicleMaintenanceCost: true, hourRunning: true, complianceSnapshot: true, complianceCheckedAt: true, createdAt: true, updatedAt: true, transferTasks: { orderBy: { sortOrder: 'asc' }, select: { id: true, taskKey: true, label: true, isOptional: true, sortOrder: true, status: true, remark: true, documents: true, createdAt: true, updatedAt: true } }, statusLogs: { orderBy: { createdAt: 'asc' }, select: { id: true, oldStatus: true, newStatus: true, remark: true, createdAt: true } } } },
    listing: { select: { id: true, partnerId: true, categoryId: true, brandId: true, modelId: true, title: true, ownerName: true, price: true, isNegotiable: true, manufacturingYear: true, operatingHours: true, locationState: true, locationCity: true, address: true, condition: true, description: true, additionalDescription: true, grossPower: true, engineNumber: true, registrationNumberKey: true, chassisNumberKey: true, status: true, soldAt: true, views: true, adminMarginAmount: true, adminExpenseAmount: true, adminExpenseBreakdown: true, createdAt: true, updatedAt: true, category: { select: { id: true, name: true } }, brand: { select: { id: true, name: true } }, model: { select: { id: true, name: true, brandId: true } }, media: { select: { id: true, url: true, type: true, slot: true, isFeatured: true, aiAnalysis: true, aiAnalyzedAt: true, createdAt: true } }, saleRecord: { select: { id: true, listingId: true, buyerName: true, buyerPhone: true, buyerCity: true, buyerState: true, soldPrice: true, soldAt: true, invoiceNo: true, notes: true, createdAt: true, updatedAt: true } }, paymentSubmissions: { select: { id: true, listingId: true, buyerId: true, partnerId: true, method: true, status: true, amount: true, customerCity: true, customerState: true, submittedAt: true, createdAt: true, updatedAt: true } }, partner: { select: { id: true, name: true, mobile: true, email: true, partnerProfile: { select: { id: true, partnerCode: true, businessName: true, partnerType: true, accountStatus: true, kycStatus: true } } } }, leads: { where: { wonSellAccountId: { not: null } }, select: { id: true, listingId: true, customerId: true, dealerId: true, ownerId: true, status: true, enquiryType: true, source: true, leadType: true, wonSellAccountId: true, score: true, createdAt: true, updatedAt: true, customer: { select: { id: true, name: true, mobile: true, email: true, city: true, state: true } }, dealer: { select: { id: true, name: true, mobile: true, email: true, role: true } }, owner: { select: { id: true, name: true, email: true, role: true } }, followUps: { select: { id: true, leadId: true, contactUserId: true, ownerId: true, type: true, status: true, dueAt: true, title: true, notes: true, completedAt: true } } } } } },
} as const;

export const buildSoldVehicleDetail = async (db: DetailDb, args: SoldVehicleDetailArguments) => {
  const dealId = args.dealId?.trim();
  const recordNumber = args.recordNumber?.trim();
  if (!dealId && !recordNumber) throw new SoldVehicleDetailError('Provide an exact sold-vehicle deal ID or record number.', 'IDENTIFIER_REQUIRED');
  if (dealId && dealId.length < 8 || recordNumber && recordNumber.length < 3) throw new SoldVehicleDetailError('The sold-vehicle identifier is not valid.', 'IDENTIFIER_INVALID');

  const account = await db.sellAccount.findFirst({ where: { deletedAt: null, ...(dealId ? { id: dealId } : {}), ...(recordNumber ? { recordNumber } : {}) }, select: detailSelect } as never) as Record<string, unknown> | null;
  if (!account) return { found: false, requested: { dealId: dealId ?? null, recordNumber: recordNumber ?? null }, dataAvailability: 'UNAVAILABLE', message: 'No sold vehicle record matched the exact identifier.' as const };

  const id = String(account.id);
  const sourcePayments = Array.isArray(account.payments) ? account.payments.map(asRecord) : [];
  const sourceRefunds = Array.isArray(account.refunds) ? account.refunds.map(asRecord) : [];
  const sourceStatusHistory = Array.isArray(account.statusHistory) ? account.statusHistory.map(asRecord) : [];
  const sourcePaymentIds = sourcePayments.map((payment) => payment.id).filter((value): value is string => typeof value === 'string');
  const actorIds = Array.from(new Set([
    ...sourceStatusHistory.map((row) => row.changedById),
    ...sourcePayments.flatMap((payment) => [payment.issuedById, payment.cancelledById, payment.createdById]),
    ...sourceRefunds.flatMap((refund) => [refund.requestedById, refund.approvedById, refund.rejectedById, refund.paidById]),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)));
  const communicationWhere = { OR: [{ relatedEntityType: 'SELL_ACCOUNT', relatedEntityId: id }, ...(sourcePaymentIds.length ? [{ relatedEntityType: 'SELL_ACCOUNT_PAYMENT', relatedEntityId: { in: sourcePaymentIds } }] : [])] };
  const [vouchers, documents, financeDeal, schedules, writeOffs, financePartyLinks, lockHistoryRows, actorRows, whatsappRows, smsRows] = await Promise.all([
    db.finVoucher.findMany({ where: { sellAccountId: id }, orderBy: { date: 'asc' }, select: { ...({ id: true, number: true, type: true, date: true, status: true, narration: true, reference: true, paymentMethod: true, partyId: true, sellAccountId: true, totalAmount: true, sourceType: true, sourceId: true, sourceEvent: true, createdAt: true } as const), lines: { orderBy: { lineNo: 'asc' }, select: { id: true, lineNo: true, accountId: true, partyId: true, sellAccountId: true, debit: true, credit: true, narration: true, billRef: true } } } } as never),
    db.finDocument.findMany({ where: { sellAccountId: id }, orderBy: { date: 'asc' }, select: { id: true, docType: true, status: true, number: true, partyDocNumber: true, date: true, dueDate: true, partyId: true, placeOfSupply: true, isIntraState: true, isReverseCharge: true, reason: true, againstDocumentId: true, againstReference: true, sellAccountId: true, notes: true, subTotal: true, cgst: true, sgst: true, igst: true, tdsAmount: true, roundOff: true, total: true, voucherId: true, cancelReason: true, cancelledAt: true, createdAt: true, updatedAt: true, lines: { orderBy: { lineNo: 'asc' }, select: { id: true, lineNo: true, description: true, accountId: true, hsnSac: true, quantity: true, rate: true, discount: true, taxableValue: true, gstRate: true, cgst: true, sgst: true, igst: true, itcEligible: true, sellAccountId: true } } } } as never),
    db.finVehicleDealExt.findUnique({ where: { sellAccountId: id } } as never),
    db.finPaymentSchedule.findMany({ where: { sellAccountId: id }, orderBy: { dueDate: 'asc' } } as never),
    db.finWriteOff.findMany({ where: { sellAccountId: id }, orderBy: { date: 'asc' } } as never),
    db.finPartyLink?.findMany({ where: { linkId: id, linkType: { in: ['SELL_ACCOUNT_SELLER', 'SELL_ACCOUNT_PURCHASER', 'SELL_ACCOUNT_BROKER'] } }, select: { id: true, partyId: true, linkType: true, linkId: true, createdAt: true } } as never) ?? Promise.resolve([]),
    db.sellAccountLockHistory?.findMany({ where: { sellAccountId: id }, orderBy: { createdAt: 'asc' }, select: { id: true, action: true, actorId: true, reason: true, createdAt: true } } as never) ?? Promise.resolve([]),
    db.user?.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true, role: true } } as never) ?? Promise.resolve([]),
    db.whatsAppMessageLog?.findMany({ where: communicationWhere, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, eventCode: true, relatedEntityType: true, relatedEntityId: true, recipientType: true, recipientPhone: true, status: true, errorCode: true, errorMessage: true, createdAt: true, sentAt: true, deliveredAt: true, readAt: true, outbox: { select: { attempts: true, status: true, nextAttemptAt: true, processedAt: true, lastError: true } } } } as never) ?? Promise.resolve([]),
    db.smsMessageLog?.findMany({ where: communicationWhere, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, eventCode: true, relatedEntityType: true, relatedEntityId: true, recipientType: true, recipientPhone: true, status: true, errorCode: true, errorMessage: true, createdAt: true, sentAt: true, outbox: { select: { attempts: true, status: true, nextAttemptAt: true, processedAt: true, lastError: true } } } } as never) ?? Promise.resolve([]),
  ]);

  const payments = Array.isArray(account.payments) ? account.payments.map(safePayment) : [];
  const refunds = Array.isArray(account.refunds) ? account.refunds.map(safeRefund) : [];
  const financialReconciliation = reconcileSoldVehicleFinancials({
    purchaseAmount: numericOrNull(account.purchaseAmount),
    sellAmount: numericOrNull(account.sellAmount),
    expenses: numericOrNull(account.expenses),
    expenseBreakdown: safeJson(account.expenseBreakdown),
    purchaseExchangeValue: numericOrNull(account.purchaseExchangeValue),
    saleExchangeValue: numericOrNull(account.saleExchangeValue),
    gstRatePercent: numericOrNull(account.gstRatePercent),
    taxMode: typeof account.taxMode === 'string' ? account.taxMode : null,
    marginBasis: typeof account.marginBasis === 'string' ? account.marginBasis : null,
    sellerState: typeof account.sellerState === 'string' ? account.sellerState : null,
    purchaserState: typeof account.purchaserState === 'string' ? account.purchaserState : null,
    cancelled: Boolean(account.cancelledAt),
    payments: payments.map((payment) => ({
      id: typeof payment.id === 'string' ? payment.id : null,
      side: typeof payment.side === 'string' ? payment.side : null,
      amount: numeric(payment.amount),
      receiptStatus: typeof payment.receiptStatus === 'string' ? payment.receiptStatus : null,
      cancelledAt: typeof payment.cancelledAt === 'string' ? payment.cancelledAt : null,
      paymentDate: typeof payment.paymentDate === 'string' ? payment.paymentDate : null,
      method: typeof payment.method === 'string' ? payment.method : null,
      reference: typeof payment.reference === 'string' ? payment.reference : null,
      receiptNumber: typeof payment.receiptNumber === 'string' ? payment.receiptNumber : null,
      listingPaymentId: typeof payment.listingPaymentId === 'string' ? payment.listingPaymentId : null,
    })),
    refunds: refunds.map((refund) => ({
      id: typeof refund.id === 'string' ? refund.id : null,
      status: typeof refund.status === 'string' ? refund.status : null,
      amount: numeric(refund.amount),
      forfeitAmount: numeric(refund.forfeitAmount),
    })),
    source: { balanceAmount: numericOrNull(account.balanceAmount), netProfit: numericOrNull(account.netProfit), netProfitAfterGst: numericOrNull(account.netProfitAfterGst) },
  });
  const listing = safeListing(account.listing);
  const operationalAudit = buildSoldVehicleOperationalAudit({
    actors: (Array.isArray(actorRows) ? actorRows : []).map((actor) => ({ id: String(actor.id), name: typeof actor.name === 'string' ? actor.name : null, email: typeof actor.email === 'string' ? actor.email : null, role: typeof actor.role === 'string' ? actor.role : null })),
    statusHistory: sourceStatusHistory.map((row) => ({ id: typeof row.id === 'string' ? row.id : null, oldStatus: typeof row.oldStatus === 'string' ? row.oldStatus : null, newStatus: typeof row.newStatus === 'string' ? row.newStatus : null, reason: typeof row.reason === 'string' ? row.reason : null, changedById: typeof row.changedById === 'string' ? row.changedById : null, createdAt: row.createdAt instanceof Date || typeof row.createdAt === 'string' ? row.createdAt : null })),
    lockHistory: (Array.isArray(lockHistoryRows) ? lockHistoryRows : []).map((row) => ({ id: typeof row.id === 'string' ? row.id : null, action: typeof row.action === 'string' ? row.action : null, actorId: typeof row.actorId === 'string' ? row.actorId : null, reason: typeof row.reason === 'string' ? row.reason : null, createdAt: row.createdAt instanceof Date || typeof row.createdAt === 'string' ? row.createdAt : null })),
    currentLock: { isLocked: Boolean(account.isLocked), lockedAt: iso(account.lockedAt), lockedById: typeof account.lockedById === 'string' ? account.lockedById : null },
    payments: payments.map((payment) => ({ id: typeof payment.id === 'string' ? payment.id : null, side: typeof payment.side === 'string' ? payment.side : null, amount: numeric(payment.amount), paymentDate: typeof payment.paymentDate === 'string' ? payment.paymentDate : null, method: typeof payment.method === 'string' ? payment.method : null, reference: typeof payment.reference === 'string' ? payment.reference : null, drawnOn: typeof payment.drawnOn === 'string' ? payment.drawnOn : null, receiptStatus: typeof payment.receiptStatus === 'string' ? payment.receiptStatus : null, issuedById: typeof payment.issuedById === 'string' ? payment.issuedById : null, cancelledById: typeof payment.cancelledById === 'string' ? payment.cancelledById : null, createdById: typeof payment.createdById === 'string' ? payment.createdById : null, listingPaymentId: typeof payment.listingPaymentId === 'string' ? payment.listingPaymentId : null })),
    refunds: refunds.map((refund) => ({ id: typeof refund.id === 'string' ? refund.id : null, status: typeof refund.status === 'string' ? refund.status : null, amount: numeric(refund.amount), forfeitAmount: numeric(refund.forfeitAmount), reason: typeof refund.reason === 'string' ? refund.reason : null, requestedById: typeof refund.requestedById === 'string' ? refund.requestedById : null, approvedById: typeof refund.approvedById === 'string' ? refund.approvedById : null, approvedAt: typeof refund.approvedAt === 'string' ? refund.approvedAt : null, rejectedById: typeof refund.rejectedById === 'string' ? refund.rejectedById : null, rejectedAt: typeof refund.rejectedAt === 'string' ? refund.rejectedAt : null, paidById: typeof refund.paidById === 'string' ? refund.paidById : null, paidAt: typeof refund.paidAt === 'string' ? refund.paidAt : null, method: typeof refund.method === 'string' ? refund.method : null, reference: typeof refund.reference === 'string' ? refund.reference : null, drawnOn: typeof refund.drawnOn === 'string' ? refund.drawnOn : null, note: typeof refund.note === 'string' ? refund.note : null })),
    dealNotes: {
      remarks: typeof account.remarks === 'string' ? account.remarks : null,
      transferDetails: typeof account.transferDetails === 'string' ? account.transferDetails : null,
      rtoNoteSheet: typeof asRecord(account.rtoRecord).noteSheet === 'string' ? asRecord(account.rtoRecord).noteSheet as string : null,
      financeNotes: typeof asRecord(financeDeal).notes === 'string' ? asRecord(financeDeal).notes as string : null,
      saleNotes: typeof asRecord(asRecord(account.listing).saleRecord).notes === 'string' ? asRecord(asRecord(account.listing).saleRecord).notes as string : null,
    },
    communicationLogs: { whatsapp: (Array.isArray(whatsappRows) ? whatsappRows : []).map(safeCommunicationLog) as never, sms: (Array.isArray(smsRows) ? smsRows : []).map(safeCommunicationLog) as never },
    listingPayments: listing && Array.isArray(listing.paymentSubmissions) ? listing.paymentSubmissions.map((payment) => { const item = asRecord(payment); return { id: String(item.id || ''), status: typeof item.status === 'string' ? item.status : null, amount: numeric(item.amount), method: typeof item.method === 'string' ? item.method : null, transactionRef: typeof item.transactionRef === 'string' ? item.transactionRef : null, submittedAt: typeof item.submittedAt === 'string' ? item.submittedAt : null }; }).filter((payment) => payment.id) : [],
  });
  const safeRtoData = safeRto(account.rtoRecord);
  const deedWorkflows = Array.isArray(account.deedWorkflows) ? account.deedWorkflows.map(safeDeedWorkflow) : [];
  const connectedModules = buildSoldVehicleConnectedModules({
    dealId: id,
    listingId: typeof account.listingId === 'string' ? account.listingId : null,
    listing: listing ? {
      id: typeof listing.id === 'string' ? listing.id : null,
      partnerId: typeof listing.partnerId === 'string' ? listing.partnerId : null,
      partner: listing.partner && typeof listing.partner === 'object' ? { id: (listing.partner as Record<string, unknown>).id, profileId: asRecord((listing.partner as Record<string, unknown>).profile).id } : null,
      paymentSubmissions: Array.isArray(listing.paymentSubmissions) ? listing.paymentSubmissions as Record<string, unknown>[] : [],
    } : null,
    crmLeads: listing && Array.isArray(listing.leads) ? listing.leads as never : [],
    rto: safeRtoData ? { ...safeRtoData.record, transferTasks: safeRtoData.transferTasks } : null,
    finance: {
      vouchers: Array.isArray(vouchers) ? vouchers.map(safeVoucher) : [],
      documents: Array.isArray(documents) ? documents.map(safeFinanceDocument) : [],
      dealExtension: safeFinanceExt(financeDeal),
      schedules: Array.isArray(schedules) ? schedules.map(safeSchedule) : [],
      writeOffs: Array.isArray(writeOffs) ? writeOffs.map(safeWriteOff) : [],
      partyLinks: Array.isArray(financePartyLinks) ? financePartyLinks.map((row) => ({ id: row.id, partyId: row.partyId, linkType: row.linkType, linkId: row.linkId, createdAt: row.createdAt })) : [],
    },
    documents: {
      accountDocuments: safeDocumentCollection(account.documents) as Record<string, unknown>[],
      deedWorkflows,
      listingMedia: listing && Array.isArray(listing.media) ? listing.media as Record<string, unknown>[] : [],
      rtoTaskDocuments: safeRtoData?.transferTasks.flatMap((task) => Array.isArray(task.documents) ? task.documents : []) as Record<string, unknown>[] ?? [],
    },
    websiteAdvances: {
      submissions: listing && Array.isArray(listing.paymentSubmissions) ? listing.paymentSubmissions as Record<string, unknown>[] : [],
      linkedReceipts: payments.filter((payment) => payment.listingPaymentId).map((payment) => ({ paymentId: payment.id, listingPaymentId: payment.listingPaymentId })),
    },
    communications: operationalAudit.communications as never,
  });
  const relationships = { listingId: account.listingId ?? null, rtoRecordId: asRecord(account.rtoRecord).id ?? null, customerIds: listing && Array.isArray(listing.leads) ? listing.leads.map((item) => asRecord(item).customerId).filter(Boolean) : [], partnerId: listing ? asRecord(listing).partnerId ?? null : null, financeRecordId: id };
  const relationshipWarnings: string[] = [];
  if (!account.listingId) relationshipWarnings.push('No listing is linked to this sold vehicle record.');
  if (!account.rtoRecord) relationshipWarnings.push('No RTO record is linked to this sold vehicle record.');
  if (!listing || !Array.isArray(listing.leads) || listing.leads.length === 0) relationshipWarnings.push('No won CRM lead/customer link was found for this record.');
  const financeRows = [...(Array.isArray(vouchers) ? vouchers : []), ...(Array.isArray(documents) ? documents : []), ...(Array.isArray(schedules) ? schedules : []), ...(Array.isArray(writeOffs) ? writeOffs : [])];
  if (financeRows.some((item) => asRecord(item).sellAccountId && asRecord(item).sellAccountId !== id)) relationshipWarnings.push('A connected finance row has a mismatched sold-account identifier.');

  return {
    found: true,
    dataAvailability: 'AVAILABLE' as const,
    source: 'database' as const,
    exactLookup: { dealId: dealId ?? null, recordNumber: recordNumber ?? null },
    deal: {
      ...Object.fromEntries(Object.entries(account).filter(([key]) => !['payments', 'refunds', 'statusHistory', 'deedWorkflows', 'rtoRecord', 'listing'].includes(key) && !/^.+(?:TokenHash|Ciphertext)$/u.test(key))),
      purchaseExchangeValue: numeric(account.purchaseExchangeValue), saleExchangeValue: numeric(account.saleExchangeValue), purchaseAmount: numeric(account.purchaseAmount), sellAmount: numeric(account.sellAmount), expenses: numeric(account.expenses), balanceAmount: numeric(account.balanceAmount), netProfit: numeric(account.netProfit), netProfitAfterGst: numeric(account.netProfitAfterGst), gstRatePercent: numeric(account.gstRatePercent), expenseBreakdown: safeJson(account.expenseBreakdown), documents: safeDocumentCollection(account.documents),
      sellDate: iso(account.sellDate), purchaserDate: iso(account.purchaserDate), sellerDate: iso(account.sellerDate), draftSavedAt: iso(account.draftSavedAt), lockedAt: iso(account.lockedAt), completedAt: iso(account.completedAt), invoiceGeneratedAt: iso(account.invoiceGeneratedAt), invoiceTokenExpiresAt: iso(account.invoiceTokenExpiresAt), invoiceSentAt: iso(account.invoiceSentAt), invoiceDelivery: safeJson(account.invoiceDelivery), cancelledAt: iso(account.cancelledAt), creditNoteDate: iso(account.creditNoteDate), createdAt: iso(account.createdAt), updatedAt: iso(account.updatedAt),
      financials: {
        purchaserReceived: financialReconciliation.payments.customer.realAmount,
        sellerPaid: financialReconciliation.payments.seller.realAmount,
        refundsPaid: financialReconciliation.refunds.paidAmount,
        forfeitAmount: financialReconciliation.refunds.forfeitAmount,
        sourceBalanceAmount: numeric(account.balanceAmount),
        sourceNetProfit: numeric(account.netProfit),
        sourceNetProfitAfterGst: numeric(account.netProfitAfterGst),
        reconciled: financialReconciliation,
      },
    },
    parties: { owner: { name: account.ownerName ?? null, number: account.ownerNumber ?? null }, seller: { name: account.sellerName ?? null, number: account.sellerNumber ?? null, city: account.sellerCity ?? null, state: account.sellerState ?? null }, purchaser: { name: account.purchaserName ?? null, number: account.purchaserNumber ?? null, city: account.purchaserCity ?? null, state: account.purchaserState ?? null }, broker: { name: account.brokerName ?? null, number: account.brokerNumber ?? null } },
    vehicle: { number: account.vehicleNumber ?? null, chassisNumber: account.chassisNumber ?? null, type: account.vehicleType ?? null, brand: account.brandName ?? null, model: account.vehicleModel ?? null, purchaseExchangeVehicle: account.purchaseExchangeVehicle ?? null, saleExchangeVehicle: account.saleExchangeVehicle ?? null },
    payments: { items: payments, purchaserReceived: financialReconciliation.payments.customer.realAmount, sellerPaid: financialReconciliation.payments.seller.realAmount, purchaserBalance: financialReconciliation.payments.customer.balance, sellerBalance: financialReconciliation.payments.seller.balance, reconciliation: financialReconciliation.payments, duplicatePrevention: financialReconciliation.duplicatePrevention },
    refunds: { items: refunds, paidAmount: financialReconciliation.refunds.paidAmount, pendingAmount: financialReconciliation.refunds.pendingAmount, reconciliation: financialReconciliation.refunds },
    financialReconciliation,
    documents: { accountDocuments: safeDocumentCollection(account.documents), deedWorkflows, listingMedia: listing && Array.isArray(listing.media) ? listing.media : [], rtoTaskDocuments: safeRtoData?.transferTasks.map((item) => item.documents).flat() ?? [] },
    rto: safeRtoData,
    connectedModules,
    listing,
    audit: Array.isArray(account.statusHistory) ? account.statusHistory.map((item) => { const history = asRecord(item); return { id: valueOrNull(history.id), oldStatus: valueOrNull(history.oldStatus), newStatus: valueOrNull(history.newStatus), reason: valueOrNull(history.reason), changedById: valueOrNull(history.changedById), createdAt: iso(history.createdAt) }; }) : [],
    auditOperationalData: operationalAudit,
    finance: { vouchers: Array.isArray(vouchers) ? vouchers.map(safeVoucher) : [], documents: Array.isArray(documents) ? documents.map(safeFinanceDocument) : [], dealExtension: safeFinanceExt(financeDeal), paymentSchedules: Array.isArray(schedules) ? schedules.map(safeSchedule) : [], writeOffs: Array.isArray(writeOffs) ? writeOffs.map(safeWriteOff) : [] },
    relationships,
    relationshipWarnings,
    missingFields: Object.entries({ ownerName: account.ownerName, vehicleNumber: account.vehicleNumber, chassisNumber: account.chassisNumber, sellerName: account.sellerName, purchaserName: account.purchaserName, invoiceNumber: account.invoiceNumber, listingId: account.listingId }).filter(([, value]) => value === null || value === undefined || value === '').map(([key]) => key),
    fileActions: [],
  };
};
