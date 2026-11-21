type JsonRecord = Record<string, unknown>;

export type RtoWorkDossierArguments = {
  rtoId?: string;
  vehicleNumber?: string;
  recordNumber?: string;
  invoiceNumber?: string;
  chassisNumber?: string;
  query?: string;
};

export class RtoWorkDossierError extends Error {
  constructor(public readonly code: 'IDENTIFIER_REQUIRED' | 'IDENTIFIER_INVALID', message: string) {
    super(message);
    this.name = 'RtoWorkDossierError';
  }
}

type RtoDossierDb = {
  vehicleRtoRecord: { findMany: (args: JsonRecord) => Promise<JsonRecord[]> };
  sellAccount?: { findFirst?: (args: JsonRecord) => Promise<JsonRecord | null> };
};

const record = (value: unknown): JsonRecord => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
);

const text = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const normalize = (value: unknown) => text(value)?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';

const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    const result = Number(value.toNumber());
    return Number.isFinite(result) ? result : null;
  }
  const result = Number(value);
  return Number.isFinite(result) && value !== null && value !== '' ? result : null;
};

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const safeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(safeJson);
  if (!value || typeof value !== 'object') return value;
  const output: JsonRecord = {};
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (/(?:password|token|secret|authorization|signature|private.?key|file.?url|storage.?key)/iu.test(key)) continue;
    output[key] = safeJson(child);
  }
  return output;
};

const fileMetadata = (value: unknown) => {
  const item = record(value);
  return {
    id: text(item.id),
    fileName: text(item.fileName) || text(item.name),
    mimeType: text(item.mimeType) || text(item.contentType),
    size: numberValue(item.size),
    uploadedAt: iso(item.uploadedAt || item.createdAt),
    available: Boolean(text(item.fileUrl) || text(item.url) || text(item.path)),
  };
};

const dossierSelect = {
  id: true, listingId: true, sellAccountId: true, customerName: true, customerNumber: true,
  vehicleNumber: true, brandName: true, vehicleType: true, vehicleModel: true,
  hirePurchaseStatus: true, financerName: true, taxStatus: true, taxValidUntil: true,
  fitnessStatus: true, fitnessValidUntil: true, insuranceStatus: true, insuranceValidUntil: true,
  pucStatus: true, pucValidUntil: true, hsrpStatus: true, hsrpNumber: true,
  sellerName: true, sellerNumber: true, purchaserName: true, purchaserNumber: true,
  rtoOffice: true, rtoAgentName: true, rtoAgentState: true, rtoAgentCity: true,
  rtoAgentNumber: true, rtoExpenses: true, rtoExpensesAdvance: true, documentSendDate: true,
  rtoStatus: true, isLocked: true, lockedAt: true, noteSheet: true, vehicleMaintenanceCost: true,
  hourRunning: true, complianceSnapshot: true, complianceCheckedAt: true, createdAt: true, updatedAt: true,
  transferTasks: { orderBy: { sortOrder: 'asc' }, include: { logs: true } },
  statusLogs: { orderBy: { createdAt: 'desc' } },
  listing: { include: { category: true, brand: true, model: true, media: true, paymentSubmissions: true, vehicleVerification: true, partner: true } },
  sellAccount: { include: { payments: true, refunds: true, statusHistory: true } },
} as const;

const buildWhere = (args: RtoWorkDossierArguments): JsonRecord => {
  if (args.rtoId) return { id: args.rtoId };
  if (args.vehicleNumber) return { vehicleNumber: normalize(args.vehicleNumber) };
  if (args.recordNumber) return { sellAccount: { is: { recordNumber: args.recordNumber.trim() } } };
  if (args.invoiceNumber) return { sellAccount: { is: { invoiceNumber: args.invoiceNumber.trim() } } };
  if (args.chassisNumber) {
    return { OR: [
      { listing: { is: { chassisNumberKey: normalize(args.chassisNumber) } } },
      { sellAccount: { is: { chassisNumber: normalize(args.chassisNumber) } } },
    ] };
  }
  const query = args.query!.trim();
  return { OR: [
    { vehicleNumber: { contains: query, mode: 'insensitive' } },
    { customerName: { contains: query, mode: 'insensitive' } },
    { sellerName: { contains: query, mode: 'insensitive' } },
    { purchaserName: { contains: query, mode: 'insensitive' } },
    { rtoOffice: { contains: query, mode: 'insensitive' } },
    { rtoAgentName: { contains: query, mode: 'insensitive' } },
    { listing: { is: { title: { contains: query, mode: 'insensitive' } } } },
    { sellAccount: { is: { recordNumber: { contains: query, mode: 'insensitive' } } } },
  ] };
};

const candidate = (item: JsonRecord) => {
  const listing = record(item.listing);
  const sale = record(item.sellAccount);
  return {
    vehicleNumber: text(item.vehicleNumber) || text(listing.registrationNumberKey),
    title: text(listing.title),
    recordNumber: text(sale.recordNumber),
    rtoOffice: text(item.rtoOffice),
    rtoStatus: text(item.rtoStatus),
    customerName: text(item.customerName),
    updatedAt: iso(item.updatedAt),
  };
};

const taskItems = (items: unknown) => (Array.isArray(items) ? items : []).map((value) => {
  const item = record(value);
  const docs = Array.isArray(item.documents) ? item.documents.map(fileMetadata) : [];
  return {
    id: text(item.id), taskKey: text(item.taskKey), label: text(item.label),
    status: text(item.status), optional: Boolean(item.isOptional), sortOrder: numberValue(item.sortOrder),
    remark: text(item.remark), documents: docs, documentCount: docs.length,
    updatedAt: iso(item.updatedAt), logs: Array.isArray(item.logs)
      ? item.logs.map((log) => { const entry = record(log); return { status: text(entry.status), remark: text(entry.remark), createdAt: iso(entry.createdAt) }; })
      : [],
  };
});

export const buildRtoWorkDossier = async (db: RtoDossierDb, args: RtoWorkDossierArguments) => {
  const provided = Object.values(args).some((value) => typeof value === 'string' && value.trim());
  if (!provided) throw new RtoWorkDossierError('IDENTIFIER_REQUIRED', 'RTO dossier ke liye vehicle, chassis, record, invoice ya search query deni hogi.');
  if (args.rtoId && !/^[0-9a-f-]{36}$/iu.test(args.rtoId)) {
    throw new RtoWorkDossierError('IDENTIFIER_INVALID', 'RTO record identifier valid format me nahi hai.');
  }

  const rows = await db.vehicleRtoRecord.findMany({ where: buildWhere(args), select: dossierSelect, take: 10 });
  if (rows.length === 0) return { found: false, dataAvailability: 'UNAVAILABLE', message: 'Is identifier ke liye RTO record nahi mila.', candidates: [] };
  if (rows.length > 1) return { found: false, dataAvailability: 'AMBIGUOUS', message: 'Multiple RTO records mile. Exact vehicle, record ya chassis number se dobara search karein.', candidates: rows.map(candidate) };

  const item = rows[0]!;
  const listing = record(item.listing);
  const sale = record(item.sellAccount);
  const tasks = taskItems(item.transferTasks);
  const expenses = numberValue(item.rtoExpenses) || 0;
  const advance = numberValue(item.rtoExpensesAdvance) || 0;
  const missingFields = [
    ['customerName', item.customerName], ['rtoOffice', item.rtoOffice], ['rtoStatus', item.rtoStatus],
    ['chassisNumber', listing.chassisNumberKey || sale.chassisNumber], ['engineNumber', listing.engineNumber || sale.engineNumber],
  ].filter(([, value]) => !text(value)).map(([name]) => name);

  return {
    found: true, dataAvailability: 'AVAILABLE', source: 'database', fetchedAt: new Date().toISOString(),
    rto: {
      id: text(item.id), vehicleNumber: text(item.vehicleNumber) || text(listing.registrationNumberKey),
      status: text(item.rtoStatus), office: text(item.rtoOffice), agent: { name: text(item.rtoAgentName), state: text(item.rtoAgentState), city: text(item.rtoAgentCity), number: text(item.rtoAgentNumber) },
      expenses: { total: expenses, advance, balance: expenses - advance, currency: 'INR' },
      rtoExpensesTotal: expenses, rtoExpensesAdvance: advance, rtoExpensesBalance: expenses - advance,
      documentSendDate: iso(item.documentSendDate), isLocked: Boolean(item.isLocked), lockedAt: iso(item.lockedAt), noteSheet: text(item.noteSheet),
      createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt),
    },
    vehicle: { registrationNumber: text(item.vehicleNumber) || text(listing.registrationNumberKey), chassisNumber: text(listing.chassisNumberKey) || text(sale.chassisNumber), engineNumber: text(listing.engineNumber) || text(sale.engineNumber), brand: text(item.brandName) || text(record(listing.brand).name), model: text(item.vehicleModel) || text(record(listing.model).name), type: text(item.vehicleType), manufacturingYear: numberValue(listing.manufacturingYear), operatingHours: numberValue(listing.operatingHours) },
    parties: { customer: { name: text(item.customerName), number: text(item.customerNumber) }, seller: { name: text(item.sellerName) || text(sale.sellerName), number: text(item.sellerNumber) || text(sale.sellerNumber) }, purchaser: { name: text(item.purchaserName) || text(sale.purchaserName), number: text(item.purchaserNumber) || text(sale.purchaserNumber) }, financer: { name: text(item.financerName), hirePurchaseStatus: text(item.hirePurchaseStatus) } },
    compliance: { tax: { status: text(item.taxStatus), validUntil: iso(item.taxValidUntil) }, fitness: { status: text(item.fitnessStatus), validUntil: iso(item.fitnessValidUntil) }, insurance: { status: text(item.insuranceStatus), validUntil: iso(item.insuranceValidUntil) }, puc: { status: text(item.pucStatus), validUntil: iso(item.pucValidUntil) }, hsrp: { status: text(item.hsrpStatus), number: text(item.hsrpNumber) }, snapshot: safeJson(item.complianceSnapshot), checkedAt: iso(item.complianceCheckedAt) },
    tasks: { total: tasks.length, completed: tasks.filter((task) => task.status === 'COMPLETED' || task.status === 'DONE').length, pending: tasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'DONE').length, items: tasks, statusHistory: Array.isArray(item.statusLogs) ? item.statusLogs.map((log) => { const entry = record(log); return { status: text(entry.status), note: text(entry.note) || text(entry.message), createdAt: iso(entry.createdAt) }; }) : [] },
    documents: { items: tasks.flatMap((task) => task.documents.map((file) => ({ ...file, taskLabel: task.label, taskKey: task.taskKey }))), total: tasks.reduce((sum, task) => sum + task.documentCount, 0), availableCount: tasks.reduce((sum, task) => sum + task.documents.filter((file) => file.available).length, 0) },
    listing: { id: text(listing.id), title: text(listing.title), vehicle: { registrationNumber: text(listing.registrationNumberKey), chassisNumber: text(listing.chassisNumberKey), engineNumber: text(listing.engineNumber) }, status: text(listing.status), location: { city: text(listing.locationCity), state: text(listing.locationState) }, mediaCount: Array.isArray(listing.media) ? listing.media.length : 0, paymentSubmissionCount: Array.isArray(listing.paymentSubmissions) ? listing.paymentSubmissions.length : 0 },
    soldVehicle: sale.id ? { id: text(sale.id), recordNumber: text(sale.recordNumber), invoiceNumber: text(sale.invoiceNumber), status: text(sale.dealStatus), purchaseAmount: numberValue(sale.purchaseAmount), sellAmount: numberValue(sale.sellAmount), expenses: numberValue(sale.expenses), netProfit: numberValue(sale.netProfitAfterGst) ?? numberValue(sale.netProfit), paymentCount: Array.isArray(sale.payments) ? sale.payments.length : 0, refundCount: Array.isArray(sale.refunds) ? sale.refunds.length : 0 } : null,
    missingFields, relationshipWarnings: item.listingId && listing.id && item.listingId !== listing.id ? ['RTO record aur listing relationship mismatch hai; records merge nahi kiye gaye.'] : [],
  };
};
