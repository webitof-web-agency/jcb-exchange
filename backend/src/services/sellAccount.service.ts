import {
  Prisma,
  RtoHirePurchaseStatus,
  RtoHsrpStatus,
  RtoValidityStatus,
  RtoWorkStatus,
  SellAccountDealStatus,
  SellAccountPaymentMethod,
  SellAccountPaymentSide,
  SellAccountPurchaseType,
  SellAccountSaleType,
  SellAccountSourceType,
  SellAccountTaxMode,
  SellAccountMarginBasis,
} from '@prisma/client';
import prisma from '../lib/prisma';
import {
  calculateSellAccountGst,
  calculateSellAccountPaymentSummary,
  deriveSellAccountDealStatus,
  normalizeSellAccountExpenseBreakdown,
  sumSellAccountExpenseBreakdown,
  type SellAccountDealStatus as FinanceDealStatus,
} from './sellAccountFinance';
import { normalizeRtoWorkStatus, statusForSellAccountHandoff } from './rtoStatus';
import { assertDealDoneBeforeLock, assertRecordEditable } from './recordLock';
import { getLinkedRecordDeletionPolicy, RtoHandoffRequiredError } from './linkedRecordDeletion';
import { ensureRtoTransferTasks, evaluateStoredRtoCompliance, recordRtoStatusChange } from './rtoTransferStore';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const phone = (value: unknown) => text(value).replace(/\D/g, '').slice(0, 15);
const dateOrNull = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};
const money = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount >= 0 ? new Prisma.Decimal(amount) : new Prisma.Decimal(0);
};
const validEnum = <T extends string>(value: unknown, allowed: readonly T[], fallback: T) =>
  allowed.includes(String(value) as T) ? String(value) as T : fallback;
const jsonValue = (value: unknown) => (value && typeof value === 'object' ? value as Prisma.InputJsonValue : undefined);

const asFinanceStatus = (value: SellAccountDealStatus): FinanceDealStatus => value as FinanceDealStatus;

const exchangeValues = (record: any) => ({
  purchaseExchangeValue: record.purchaseType === SellAccountPurchaseType.EXCHANGE ? Number(record.purchaseExchangeValue || 0) : 0,
  saleExchangeValue: record.saleType === SellAccountSaleType.EXCHANGE ? Number(record.saleExchangeValue || 0) : 0,
});

export const paymentSummaryForRecord = (record: any, payments: Array<{ side: string; amount: unknown }>) =>
  calculateSellAccountPaymentSummary({
    sellAmount: Number(record.sellAmount),
    purchaseAmount: Number(record.purchaseAmount),
    ...exchangeValues(record),
    payments: payments.map((item) => ({ side: item.side, amount: Number(item.amount) })),
  });

// Records are hard-deleted, so a row count can point at a number that is still in use.
// Continue from the highest existing sequence for the year instead.
const nextSellAccountRecordNumber = async (client: any) => {
  const prefix = `SA-${new Date().getFullYear()}-`;
  const existing: Array<{ recordNumber: string }> = await client.sellAccount.findMany({
    where: { recordNumber: { startsWith: prefix } },
    select: { recordNumber: true },
  });
  const highest = existing.reduce((max, { recordNumber }) => {
    const sequence = Number.parseInt(recordNumber.slice(prefix.length), 10);
    return Number.isFinite(sequence) && sequence > max ? sequence : max;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
};

const assertListingAvailable = async (listingId: string | null, currentId?: string) => {
  if (!listingId) return;
  const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } });
  if (!listing) throw new Error('Linked listing was not found.');
  const linked = await prisma.sellAccount.findFirst({
    where: { listingId, ...(currentId ? { NOT: { id: currentId } } : {}) },
    select: { recordNumber: true },
  });
  if (linked) throw new Error(`This listing is already linked to Sold Vehicle record ${linked.recordNumber}.`);
};

type RtoState = {
  status: string;
  linked: boolean;
  record?: any | null;
};

const normalizeRtoState = (value?: RtoState | string): RtoState => {
  if (typeof value === 'string') {
    const linked = value !== 'PENDING';
    return { status: linked ? normalizeRtoWorkStatus(value) : 'PENDING', linked };
  }
  if (!value) return { status: 'PENDING', linked: false, record: null };
  return {
    ...value,
    status: value.linked ? normalizeRtoWorkStatus(value.status) : (value.status || 'PENDING'),
  };
};

const serialize = (rawRecord: any, rtoStateInput?: RtoState | string, dealStatusOverride?: SellAccountDealStatus) => {
  // The public invoice token hash is a credential and never leaves the server.
  const { invoiceTokenHash, ...record } = rawRecord;
  const rtoState = normalizeRtoState(rtoStateInput);
  const isDraft = record.isDraft === true;
  const payments = (record.payments || []).map((payment: any) => ({
    ...payment,
    amount: Number(payment.amount),
  }));
  const financeInput = {
    sellAmount: Number(record.sellAmount),
    purchaseAmount: Number(record.purchaseAmount),
    expenses: Number(record.expenses),
    // Sell Account policy: GST is inclusive in the margin and extracted from it.
    taxMode: SellAccountTaxMode.INCLUSIVE,
    marginBasis: record.marginBasis,
    sellerState: record.sellerState || '',
    purchaserState: record.purchaserState || '',
    ...exchangeValues(record),
    payments,
  };
  const gst = calculateSellAccountGst(financeInput);
  const paymentSummary = calculateSellAccountPaymentSummary(financeInput);
  const dealStatus = dealStatusOverride || deriveSellAccountDealStatus(
    paymentSummary.purchaserPaymentStatus,
    rtoState.status || record.rtoStatusSnapshot,
    rtoState.linked,
  );
  return {
    ...record,
    hasPublicInvoiceLink: Boolean(invoiceTokenHash) && (!record.invoiceTokenExpiresAt || new Date(record.invoiceTokenExpiresAt) > new Date()),
    purchaseAmount: Number(record.purchaseAmount),
    sellAmount: Number(record.sellAmount),
    expenses: Number(record.expenses),
    purchaseExchangeValue: Number(record.purchaseExchangeValue || 0),
    saleExchangeValue: Number(record.saleExchangeValue || 0),
    balanceAmount: paymentSummary.purchaserBalance,
    netProfit: gst.netProfitBeforeGst,
    netProfitAfterGst: gst.netProfitAfterGst,
    gstRatePercent: 18,
    taxMode: SellAccountTaxMode.INCLUSIVE,
    payments,
    dealStatus,
    isDraft,
    draftSavedAt: record.draftSavedAt,
    rtoStatusSnapshot: rtoState.status || record.rtoStatusSnapshot,
    rtoRecord: record.rtoRecord || rtoState.record || null,
    finance: { gst, payments: paymentSummary },
  };
};

const buildPayload = (body: any, existing?: any) => {
  const value = (key: string) => body[key] !== undefined ? body[key] : existing?.[key];
  const isDraft = body.isDraft !== undefined ? body.isDraft === true : existing?.isDraft === true;
  const sellDate = dateOrNull(value('sellDate'));
  if (!sellDate && !isDraft) throw new Error('Sell Date is required and must be valid.');
  const purchaseAmount = money(value('purchaseAmount'));
  const sellAmount = money(value('sellAmount'));
  const expenseBreakdown = body.expenseBreakdown !== undefined
    ? normalizeSellAccountExpenseBreakdown(body.expenseBreakdown)
    : normalizeSellAccountExpenseBreakdown(existing?.expenseBreakdown);
  // An itemised breakdown is the source of truth for the expenses total.
  const expenses = expenseBreakdown ? new Prisma.Decimal(sumSellAccountExpenseBreakdown(expenseBreakdown)) : money(value('expenses'));
  const purchaseType = validEnum(value('purchaseType'), Object.values(SellAccountPurchaseType), SellAccountPurchaseType.PURCHASE);
  const saleType = validEnum(value('saleType'), Object.values(SellAccountSaleType), SellAccountSaleType.SELL);
  const sourceTypeValue = value('sourceType');
  const sourceType = Object.values(SellAccountSourceType).includes(String(sourceTypeValue) as SellAccountSourceType)
    ? String(sourceTypeValue) as SellAccountSourceType
    : null;
  const purchaseExchangeValue = purchaseType === SellAccountPurchaseType.EXCHANGE ? money(value('purchaseExchangeValue')) : new Prisma.Decimal(0);
  const saleExchangeValue = saleType === SellAccountSaleType.EXCHANGE ? money(value('saleExchangeValue')) : new Prisma.Decimal(0);
  const taxMode = SellAccountTaxMode.INCLUSIVE;
  // Saving a record (new or edited) moves it to the current margin basis.
  const marginBasis = SellAccountMarginBasis.AFTER_EXPENSES;
  const gst = calculateSellAccountGst({
    sellAmount: Number(sellAmount),
    purchaseAmount: Number(purchaseAmount),
    expenses: Number(expenses),
    taxMode,
    marginBasis,
    sellerState: text(value('sellerState')),
    purchaserState: text(value('purchaserState')),
  });

  return {
    listingId: body.listingId !== undefined ? text(body.listingId) || null : (existing?.listingId || null),
    listingTitle: body.listingTitle !== undefined ? text(body.listingTitle) || null : (existing?.listingTitle || null),
    ownerName: text(value('ownerName')) || null,
    ownerNumber: phone(value('ownerNumber')) || null,
    vehicleNumber: text(value('vehicleNumber')).toUpperCase() || null,
    chassisNumber: text(value('chassisNumber')).toUpperCase() || null,
    sellDate,
    purchaserDate: body.purchaserDate !== undefined ? dateOrNull(body.purchaserDate) : (existing?.purchaserDate || null),
    sellerDate: body.sellerDate !== undefined ? dateOrNull(body.sellerDate) : (existing?.sellerDate || null),
    vehicleType: text(value('vehicleType')) || null,
    brandName: text(value('brandName')) || null,
    vehicleModel: text(value('vehicleModel')) || null,
    sellerName: text(value('sellerName')) || null,
    sellerNumber: phone(value('sellerNumber')) || null,
    purchaserName: text(value('purchaserName')) || null,
    purchaserNumber: phone(value('purchaserNumber')) || null,
    sellerState: text(value('sellerState')) || null,
    purchaserState: text(value('purchaserState')) || null,
    sellerCity: text(value('sellerCity')) || null,
    purchaserCity: text(value('purchaserCity')) || null,
    sourceType,
    purchaseType,
    saleType,
    purchaseExchangeValue,
    purchaseExchangeVehicle: purchaseType === SellAccountPurchaseType.EXCHANGE ? text(value('purchaseExchangeVehicle')) || null : null,
    saleExchangeValue,
    saleExchangeVehicle: saleType === SellAccountSaleType.EXCHANGE ? text(value('saleExchangeVehicle')) || null : null,
    brokerName: text(value('brokerName')) || null,
    brokerNumber: phone(value('brokerNumber')) || null,
    expenseBreakdown: expenseBreakdown ? expenseBreakdown as Prisma.InputJsonValue : Prisma.DbNull,
    purchaseAmount,
    sellAmount,
    expenses,
    balanceAmount: new Prisma.Decimal(0),
    netProfit: new Prisma.Decimal(gst.netProfitBeforeGst),
    netProfitAfterGst: new Prisma.Decimal(gst.netProfitAfterGst),
    gstRatePercent: new Prisma.Decimal(18),
    taxMode,
    marginBasis,
    transferDetails: text(value('transferDetails')) || null,
    remarks: body.remarks !== undefined ? text(body.remarks) || null : (existing?.remarks || null),
    documents: body.documents !== undefined ? jsonValue(body.documents) : (existing?.documents || undefined),
    isDraft,
    draftSavedAt: isDraft ? (dateOrNull(body.draftSavedAt) || new Date()) : null,
  };
};

const validatePayload = (payload: ReturnType<typeof buildPayload>) => {
  if (payload.isDraft) return null;
  const required: Array<[keyof ReturnType<typeof buildPayload>, string]> = [
    ['ownerName', 'Owner Name'], ['vehicleNumber', 'Registration Number'], ['vehicleType', 'Category'],
    ['vehicleModel', 'Vehicle Model'], ['sellerName', 'Seller Name'], ['purchaserName', 'Purchaser Name'],
    ['transferDetails', 'Transfer Details'],
  ];
  const missing = required.find(([key]) => !payload[key]);
  if (missing) return `${missing[1]} is required.`;
  if ((payload.ownerNumber?.length || 0) < 10 || (payload.sellerNumber?.length || 0) < 10 || (payload.purchaserNumber?.length || 0) < 10) return 'Valid 10-digit mobile numbers are required.';
  if (Number(payload.purchaseAmount) <= 0 || Number(payload.sellAmount) <= 0) return 'Purchase and sell amounts must be greater than 0.';
  if (payload.sellerState && !payload.purchaserState) return 'Purchaser state is required when seller state is provided.';
  if (payload.purchaserState && !payload.sellerState) return 'Seller state is required when purchaser state is provided.';
  if (payload.purchaseType === SellAccountPurchaseType.EXCHANGE) {
    if (Number(payload.purchaseExchangeValue) <= 0) return 'Enter the value of the vehicle given in exchange on the purchase side.';
    if (Number(payload.purchaseExchangeValue) > Number(payload.purchaseAmount)) return 'Purchase exchange value cannot exceed the purchase amount.';
  }
  if (payload.saleType === SellAccountSaleType.EXCHANGE) {
    if (Number(payload.saleExchangeValue) <= 0) return 'Enter the value of the customer vehicle taken in exchange.';
    if (Number(payload.saleExchangeValue) > Number(payload.sellAmount)) return 'Sale exchange value cannot exceed the sell amount.';
  }
  return null;
};

const getRtoState = async (client: any, sellAccountId: string, listingId: string | null): Promise<RtoState> => {
  const directlyLinked = await client.vehicleRtoRecord.findUnique({
    where: { sellAccountId },
    select: { id: true, listingId: true, sellAccountId: true, rtoStatus: true, updatedAt: true, isLocked: true, lockedAt: true },
  });
  if (directlyLinked) return { status: normalizeRtoWorkStatus(directlyLinked.rtoStatus), linked: true, record: directlyLinked };

  // A listing-level RTO record is not automatically a Sell Account handover.
  // It becomes linked only after the explicit Start RTO Work action, which also
  // safely reuses an existing listing record when one is available.
  void listingId;
  return { status: 'PENDING', linked: false, record: null };
};

const include = {
  payments: { orderBy: { paymentDate: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  rtoRecord: { select: { id: true, listingId: true, sellAccountId: true, rtoStatus: true, updatedAt: true, isLocked: true, lockedAt: true, transferTasks: { select: { status: true } } } },
};

const buildPaymentPayload = (value: any, actorId?: string) => {
  const side = validEnum(value?.side, Object.values(SellAccountPaymentSide), SellAccountPaymentSide.PURCHASER_RECEIPT);
  const method = validEnum(value?.method, Object.values(SellAccountPaymentMethod), SellAccountPaymentMethod.OTHER);
  const paymentDate = dateOrNull(value?.paymentDate) || new Date();
  return {
    side,
    method,
    amount: paymentAmount(value?.amount),
    paymentDate,
    reference: text(value?.reference) || null,
    note: text(value?.note) || null,
    createdById: actorId || null,
  };
};

const syncStatus = async (tx: any, record: any, actorId?: string) => {
  const rtoState = await getRtoState(tx, record.id, record.listingId);
  const payments = await tx.sellAccountPayment.findMany({ where: { sellAccountId: record.id } });
  const summary = paymentSummaryForRecord(record, payments);
  const nextStatus = deriveSellAccountDealStatus(summary.purchaserPaymentStatus, rtoState.status, rtoState.linked) as SellAccountDealStatus;
  if (record.isLocked) {
    return { nextStatus: record.dealStatus, rtoStatus: record.rtoStatusSnapshot || rtoState.status, rtoState };
  }
  if (record.dealStatus !== nextStatus || record.rtoStatusSnapshot !== rtoState.status) {
    await tx.sellAccount.update({ where: { id: record.id }, data: { dealStatus: nextStatus, rtoStatusSnapshot: rtoState.status } });
    if (record.dealStatus !== nextStatus) {
      await tx.sellAccountStatusHistory.create({ data: { sellAccountId: record.id, oldStatus: record.dealStatus, newStatus: nextStatus, changedById: actorId || null, reason: 'Automatically recalculated from payments and RTO progress.' } });
    }
  }
  return { nextStatus, rtoStatus: rtoState.status, rtoState };
};

/** Sync a linked Sell Account immediately after an RTO status mutation. */
export const syncSellAccountFromRto = async (tx: any, sellAccountId: string, actorId?: string) => {
  const current = await tx.sellAccount.findFirst({
    where: { id: sellAccountId, deletedAt: null },
    include,
  });
  if (!current) return null;
  return syncStatus(tx, current, actorId);
};

const ensureRtoRecord = async (tx: any, current: any, actorId?: string) => {
  const handoffVehicleData = (existing: any) => ({
    customerName: existing.customerName || current.ownerName || current.sellerName || 'Customer',
    customerNumber: existing.customerNumber || current.ownerNumber || current.sellerNumber || '',
    vehicleNumber: existing.vehicleNumber || current.vehicleNumber || '',
    brandName: existing.brandName || current.brandName || '',
    vehicleType: existing.vehicleType || current.vehicleType || '',
    vehicleModel: existing.vehicleModel || current.vehicleModel || '',
    sellerName: existing.sellerName || current.sellerName || '',
    sellerNumber: existing.sellerNumber || current.sellerNumber || '',
    purchaserName: existing.purchaserName || current.purchaserName || '',
    purchaserNumber: existing.purchaserNumber || current.purchaserNumber || '',
  });

  let rtoRecord = await tx.vehicleRtoRecord.findUnique({ where: { sellAccountId: current.id } });
  if (!rtoRecord && current.listingId) {
    const existingListingRto = await tx.vehicleRtoRecord.findFirst({
      where: { listingId: current.listingId },
      orderBy: { updatedAt: 'desc' },
    });
    if (existingListingRto) {
      if (existingListingRto.sellAccountId && existingListingRto.sellAccountId !== current.id) {
        throw new Error('This listing is already linked to another Sold Vehicle.');
      }
      rtoRecord = await tx.vehicleRtoRecord.update({
        where: { id: existingListingRto.id },
        data: {
          ...handoffVehicleData(existingListingRto),
          sellAccountId: current.id,
          rtoStatus: statusForSellAccountHandoff(existingListingRto.rtoStatus),
        },
      });
    }
  }

  if (rtoRecord) {
    const handoffStatus = statusForSellAccountHandoff(rtoRecord.rtoStatus);
    const handoffData = handoffVehicleData(rtoRecord);
    const hasMissingHandoffData = Object.entries(handoffData).some(([key, value]) => !rtoRecord[key] && Boolean(value));
    if (handoffStatus !== rtoRecord.rtoStatus || hasMissingHandoffData) {
      rtoRecord = await tx.vehicleRtoRecord.update({
        where: { id: rtoRecord.id },
        data: { ...handoffData, rtoStatus: handoffStatus },
      });
    }
  }

  if (!rtoRecord) {
    rtoRecord = await tx.vehicleRtoRecord.create({
      data: {
        listingId: current.listingId || null,
        sellAccountId: current.id,
        customerName: current.ownerName || current.sellerName || 'Customer',
        customerNumber: current.ownerNumber || current.sellerNumber || '',
        vehicleNumber: current.vehicleNumber || '',
        brandName: current.brandName || '',
        vehicleType: current.vehicleType || '',
        vehicleModel: current.vehicleModel || '',
        hirePurchaseStatus: RtoHirePurchaseStatus.PENDING,
        financerName: '',
        taxStatus: RtoValidityStatus.NOT_AVAILABLE,
        fitnessStatus: RtoValidityStatus.NOT_AVAILABLE,
        insuranceStatus: RtoValidityStatus.NOT_AVAILABLE,
        pucStatus: RtoValidityStatus.NOT_AVAILABLE,
        hsrpStatus: RtoHsrpStatus.PENDING,
        hsrpNumber: '',
        sellerName: current.sellerName || '',
        sellerNumber: current.sellerNumber || '',
        purchaserName: current.purchaserName || '',
        purchaserNumber: current.purchaserNumber || '',
        rtoOffice: '',
        rtoAgentName: '',
        rtoAgentState: '',
        rtoAgentCity: '',
        rtoAgentNumber: '',
        rtoExpenses: 0,
        rtoExpensesAdvance: 0,
        documentSendDate: null,
        rtoStatus: RtoWorkStatus.RTO_WORK_STARTED,
        noteSheet: `Started from Sold Vehicle record ${current.recordNumber}.`,
        vehicleMaintenanceCost: 0,
        hourRunning: null,
      },
    });
  }

  // The ownership-transfer checklist starts with whatever the saved validity data already
  // shows (e.g. expired insurance is flagged immediately). Existing tasks are kept as-is.
  const compliance = evaluateStoredRtoCompliance(rtoRecord, current);
  const createdTasks = await ensureRtoTransferTasks(tx, rtoRecord.id, compliance, actorId);
  if (createdTasks > 0) {
    await recordRtoStatusChange(tx, {
      rtoRecordId: rtoRecord.id,
      oldStatus: null,
      newStatus: rtoRecord.rtoStatus,
      remark: `RTO work started from Sold Vehicle record ${current.recordNumber}.`,
      actorId,
    });
  }

  return rtoRecord;
};

export const listSellAccounts = async (query: { q?: unknown; status?: unknown }) => {
  const q = text(query.q).toLowerCase();
  const status = text(query.status);
  const records = await prisma.sellAccount.findMany({
    where: {
      deletedAt: null,
      ...(q ? { OR: [
        { recordNumber: { contains: q, mode: 'insensitive' } },
        { ownerName: { contains: q, mode: 'insensitive' } },
        { vehicleNumber: { contains: q, mode: 'insensitive' } },
        { purchaserName: { contains: q, mode: 'insensitive' } },
        { sellerName: { contains: q, mode: 'insensitive' } },
      ] } : {}),
    },
    include,
    orderBy: { updatedAt: 'desc' },
  });
  const serializedRecords = await Promise.all(records.map(async (record) => {
    const synced = await syncStatus(prisma, record);
    return serialize(record, synced.rtoState, synced.nextStatus);
  }));
  if (Object.values(SellAccountDealStatus).includes(status as SellAccountDealStatus)) {
    return serializedRecords.filter((record) => record.dealStatus === status);
  }
  return serializedRecords;
};

export const getSellAccount = async (id: string) => {
  const record = await prisma.sellAccount.findFirst({ where: { OR: [{ id }, { recordNumber: id }], deletedAt: null }, include });
  if (!record) return null;
  const synced = await syncStatus(prisma, record);
  const refreshed = await prisma.sellAccount.findUnique({ where: { id: record.id }, include });
  return refreshed ? serialize(refreshed, synced.rtoState, synced.nextStatus) : null;
};

export const createSellAccount = async (body: unknown, actorId?: string) => {
  const payload = buildPayload(body);
  const error = validatePayload(payload);
  if (error) throw new Error(error);
  await assertListingAvailable(payload.listingId);
  const record = await prisma.$transaction(async (tx) => {
    const recordNumber = await nextSellAccountRecordNumber(tx);
    const created = await tx.sellAccount.create({ data: { ...payload, recordNumber, createdById: actorId || null, updatedById: actorId || null }, include });
    if (Array.isArray((body as any)?.payments)) {
      for (const payment of (body as any).payments) {
        await tx.sellAccountPayment.create({ data: { sellAccountId: created.id, ...buildPaymentPayload(payment, actorId) } });
      }
    }
    const withPayments = await tx.sellAccount.findUnique({ where: { id: created.id }, include });
    if (!payload.isDraft) {
      await tx.sellAccountStatusHistory.create({ data: { sellAccountId: created.id, newStatus: SellAccountDealStatus.OPEN, changedById: actorId || null, reason: 'Sold Vehicle created.' } });
    }
    return withPayments || created;
  });
  const synced = await syncStatus(prisma, record, actorId);
  const refreshed = await prisma.sellAccount.findUnique({ where: { id: record.id }, include });
  return serialize(refreshed || record, synced.rtoState, synced.nextStatus);
};

export const updateSellAccount = async (id: string, body: unknown, actorId?: string) => {
  const existing = await prisma.sellAccount.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return null;
  assertRecordEditable(existing.isLocked);
  const payload = buildPayload(body, existing);
  const error = validatePayload(payload);
  if (error) throw new Error(error);
  if (payload.listingId !== existing.listingId) await assertListingAvailable(payload.listingId, id);
  const record = await prisma.$transaction(async (tx) => {
    const updated = await tx.sellAccount.update({ where: { id }, data: { ...payload, updatedById: actorId || null }, include });
    if (Array.isArray((body as any)?.payments)) {
      await tx.sellAccountPayment.deleteMany({ where: { sellAccountId: id } });
      for (const payment of (body as any).payments) {
        await tx.sellAccountPayment.create({ data: { sellAccountId: id, ...buildPaymentPayload(payment, actorId) } });
      }
    }
    const withPayments = await tx.sellAccount.findUnique({ where: { id }, include });
    await syncStatus(tx, withPayments || updated, actorId);
    return (await tx.sellAccount.findUnique({ where: { id }, include })) || withPayments || updated;
  });
  const synced = await syncStatus(prisma, record, actorId);
  return serialize(record, synced.rtoState, synced.nextStatus);
};

export const deleteSellAccount = async (id: string, actorId?: string) => {
  const existing = await prisma.sellAccount.findUnique({
    where: { id },
    select: {
      id: true,
      deletedAt: true,
      isLocked: true,
      rtoRecord: { select: { id: true, isLocked: true } },
    },
  });
  if (!existing || existing.deletedAt) return false;

  const policy = getLinkedRecordDeletionPolicy({
    source: 'SELL_ACCOUNT',
    hasLinkedRto: Boolean(existing.rtoRecord),
    isLocked: existing.isLocked || Boolean(existing.rtoRecord?.isLocked),
  });
  if (policy.action === 'BLOCK') {
    if (policy.code === 'RECORD_LOCKED') assertRecordEditable(true);
    throw new RtoHandoffRequiredError();
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.sellAccount.findUnique({
      where: { id },
      select: { id: true, isLocked: true, rtoRecord: { select: { id: true, isLocked: true } } },
    });
    if (!current) return;
    assertRecordEditable(current.isLocked || Boolean(current.rtoRecord?.isLocked));
    if (current.rtoRecord) throw new RtoHandoffRequiredError();
    await tx.sellAccount.delete({ where: { id } });
  });
  return true;
};

const paymentAmount = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than 0.');
  return new Prisma.Decimal(amount);
};

export const addSellAccountPayment = async (id: string, body: any, actorId?: string) => {
  const existing = await prisma.sellAccount.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return null;
  assertRecordEditable(existing.isLocked);
  const side = validEnum(body.side, Object.values(SellAccountPaymentSide), SellAccountPaymentSide.PURCHASER_RECEIPT);
  const method = validEnum(body.method, Object.values(SellAccountPaymentMethod), SellAccountPaymentMethod.OTHER);
  const paymentDate = dateOrNull(body.paymentDate) || new Date();
  const record = await prisma.$transaction(async (tx) => {
    await tx.sellAccountPayment.create({ data: { sellAccountId: id, ...buildPaymentPayload({ ...body, side, method, paymentDate }, actorId) } });
    const current = await tx.sellAccount.findUnique({ where: { id }, include });
    if (!current) throw new Error('Sold Vehicle not found.');
    await syncStatus(tx, current, actorId);
    return tx.sellAccount.findUnique({ where: { id }, include });
  });
  if (!record) return null;
  const synced = await syncStatus(prisma, record, actorId);
  return serialize(record, synced.rtoState, synced.nextStatus);
};

export const saveAndStartRtoWork = async (id: string | undefined, body: unknown, actorId?: string) => {
  const existing = id ? await prisma.sellAccount.findUnique({ where: { id } }) : null;
  if (id && (!existing || existing.deletedAt)) return null;
  if (existing) assertRecordEditable(existing.isLocked);

  const requestBody = {
    ...((body && typeof body === 'object') ? body as Record<string, unknown> : {}),
    isDraft: false,
  };
  const payload = buildPayload(requestBody, existing);
  const error = validatePayload(payload);
  if (error) throw new Error(error);
  if (!existing || payload.listingId !== existing.listingId) await assertListingAvailable(payload.listingId, existing?.id);

  return prisma.$transaction(async (tx) => {
    let record: any;
    if (existing) {
      record = await tx.sellAccount.update({
        where: { id: existing.id },
        data: { ...payload, updatedById: actorId || null },
        include,
      });
    } else {
      const recordNumber = await nextSellAccountRecordNumber(tx);
      record = await tx.sellAccount.create({
        data: { ...payload, recordNumber, createdById: actorId || null, updatedById: actorId || null },
        include,
      });
    }

    if (Array.isArray((requestBody as any).payments)) {
      await tx.sellAccountPayment.deleteMany({ where: { sellAccountId: record.id } });
      for (const payment of (requestBody as any).payments) {
        await tx.sellAccountPayment.create({ data: { sellAccountId: record.id, ...buildPaymentPayload(payment, actorId) } });
      }
    }

    const current = await tx.sellAccount.findUnique({ where: { id: record.id }, include });
    if (!current) throw new Error('Sold Vehicle could not be saved.');
    const payments = await tx.sellAccountPayment.findMany({ where: { sellAccountId: current.id } });
    const summary = paymentSummaryForRecord(current, payments);
    if (summary.purchaserPaymentStatus !== 'FULL') {
      throw new Error('Full purchaser payment is required before starting RTO work.');
    }

    if (!existing) {
      await tx.sellAccountStatusHistory.create({
        data: {
          sellAccountId: current.id,
          newStatus: SellAccountDealStatus.OPEN,
          changedById: actorId || null,
          reason: 'Sold Vehicle created and handed over to RTO.',
        },
      });
    }

    const rtoRecord = await ensureRtoRecord(tx, current, actorId);
    const synced = await syncStatus(tx, current, actorId);
    const refreshed = await tx.sellAccount.findUnique({ where: { id: current.id }, include });
    return {
      record: refreshed ? serialize(refreshed, synced.rtoState, synced.nextStatus) : null,
      rtoRecord,
    };
  });
};

export const startRtoWork = async (id: string, actorId?: string) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.sellAccount.findFirst({
      where: { OR: [{ id }, { recordNumber: id }], deletedAt: null },
      include,
    });
    if (!current) return null;
    assertRecordEditable(current.isLocked);
    if (current.isDraft) throw new Error('Save the Sold Vehicle record before starting RTO work.');

    const payments = await tx.sellAccountPayment.findMany({ where: { sellAccountId: current.id } });
    const summary = paymentSummaryForRecord(current, payments);
    if (summary.purchaserPaymentStatus !== 'FULL') {
      throw new Error('Full purchaser payment is required before starting RTO work.');
    }

    const rtoRecord = await ensureRtoRecord(tx, current, actorId);

    const synced = await syncStatus(tx, current, actorId);
    const refreshed = await tx.sellAccount.findUnique({ where: { id: current.id }, include });
    return {
      record: refreshed ? serialize(refreshed, synced.rtoState, synced.nextStatus) : null,
      rtoRecord,
    };
  });
};

export const deleteSellAccountPayment = async (id: string, paymentId: string, actorId?: string) => {
  const account = await prisma.sellAccount.findUnique({ where: { id } });
  if (account) assertRecordEditable(account.isLocked);
  const payment = await prisma.sellAccountPayment.findFirst({ where: { id: paymentId, sellAccountId: id } });
  if (!payment) return false;
  await prisma.$transaction(async (tx) => {
    await tx.sellAccountPayment.delete({ where: { id: paymentId } });
    const current = await tx.sellAccount.findUnique({ where: { id }, include });
    if (current) await syncStatus(tx, current, actorId);
  });
  return true;
};

export const lockSellAccount = async (id: string, actorId?: string) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.sellAccount.findFirst({
      where: { OR: [{ id }, { recordNumber: id }], deletedAt: null },
      include,
    });
    if (!current) return null;

    const rtoState = await getRtoState(tx, current.id, current.listingId);
    assertDealDoneBeforeLock(rtoState.linked ? rtoState.status : current.dealStatus);

    const now = new Date();
    const locked = await tx.sellAccount.update({
      where: { id: current.id },
      data: { isLocked: true, lockedAt: current.lockedAt || now, lockedById: current.lockedById || actorId || null },
      include,
    });
    if (rtoState.record?.id) {
      await tx.vehicleRtoRecord.update({
        where: { id: rtoState.record.id },
        data: { isLocked: true, lockedAt: rtoState.record.lockedAt || now, lockedById: rtoState.record.lockedById || actorId || null },
      });
    }
    return serialize(locked, rtoState, locked.dealStatus);
  });
};

export const lockRtoWorkRecord = async (id: string, actorId?: string) => {
  return prisma.$transaction(async (tx) => {
    const current = await tx.vehicleRtoRecord.findUnique({ where: { id } });
    if (!current) return null;
    assertDealDoneBeforeLock(current.rtoStatus);

    const now = new Date();
    const locked = await tx.vehicleRtoRecord.update({
      where: { id },
      data: { isLocked: true, lockedAt: current.lockedAt || now, lockedById: current.lockedById || actorId || null },
    });
    if (current.sellAccountId) {
      await tx.sellAccount.update({
        where: { id: current.sellAccountId },
        data: { isLocked: true, lockedAt: now, lockedById: actorId || null },
      });
    }
    return locked;
  });
};
