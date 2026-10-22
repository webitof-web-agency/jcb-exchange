import { randomUUID } from 'node:crypto';
import { FinTaxType, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { SELL_ACCOUNT_GST_RATE_PERCENT } from '../../../services/sellAccountFinance';
import { badRequest, notFound } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { isValidGstin } from '../utils/india';
import { dateOnly, readDate, readEnum, readMoney, readMultiline, readString } from '../utils/input';
import { roundMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { gstr1Section, match2b, parse2bJson, setOff, type PortalPurchase, type Tax } from './gstRules';
import { CASH_BANK_KINDS, LEDGER_STATUSES, type VoucherLineInput } from './ledgerRules';
import type { LedgerAccess } from './ledger.service';
import { postSystemVoucher, vline } from './systemVoucher';

// Taxation: GST registers and returns support, ITC, set-off, GSTR-2B reconciliation, TDS/TCS,
// challans, e-invoice / e-way bill references and income-tax provisions.

const ZERO = new Prisma.Decimal(0);
const round = (value: number) => Math.round(value * 100) / 100;
const num = (value: Prisma.Decimal | null | undefined) => (value ? value.toNumber() : 0);
const OUTPUT = { igst: 'GST_OUTPUT_IGST', cgst: 'GST_OUTPUT_CGST', sgst: 'GST_OUTPUT_SGST' } as const;
const INPUT = { igst: 'GST_INPUT_IGST', cgst: 'GST_INPUT_CGST', sgst: 'GST_INPUT_SGST' } as const;
/** Vouchers that move tax between tax ledgers rather than record a supply. */
const NOT_SUPPLIES = ['GST_SETOFF', 'TAX_CHALLAN'];

const monthRange = (body: Record<string, unknown>) => {
  const key = typeof body.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.month) ? body.month : istToday().toISOString().slice(0, 7);
  const [year, month] = key.split('-').map(Number) as [number, number];
  return { key, from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 0)) };
};
const readRange = (query: Record<string, unknown>) => {
  if (typeof query.month === 'string' && query.month) return monthRange(query);
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? financialYearOf(to).startDate;
  return { key: null, from, to };
};

const systemIds = async () => new Map((await prisma.finAccount.findMany({ where: { systemKey: { not: null } }, select: { id: true, systemKey: true } })).map((account) => [account.systemKey!, account.id]));

export type GstRow = {
  key: string; source: string; kind: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'; date: string; number: string | null; invoiceNo: string; partyId: string | null; partyName: string | null;
  gstin: string | null; placeOfSupply: string | null; interState: boolean; taxable: number; igst: number; cgst: number; sgst: number; tax: number; invoiceValue: number;
  reverseCharge: boolean; ineligibleTax: number; marginScheme: boolean; section: string | null; hsn: Array<{ hsn: string; rate: number; taxable: number; tax: number }>;
};

/** Sales (outward) or purchase (inward) GST register for a period. */
export const gstRegister = async (side: 'SALES' | 'PURCHASES', range: { from: Date; to: Date }) => {
  const ids = await systemIds();
  const taxIds = Object.fromEntries(Object.entries(side === 'SALES' ? OUTPUT : INPUT).map(([component, key]) => [component, ids.get(key)])) as Record<keyof Tax, string | undefined>;
  const taxAccountIds = Object.values(taxIds).filter((id): id is string => Boolean(id));
  const docTypes = side === 'SALES' ? (['SALES_INVOICE', 'CREDIT_NOTE'] as const) : (['PURCHASE_BILL', 'DEBIT_NOTE'] as const);
  const [documents, vouchers, accounts] = await Promise.all([
    prisma.finDocument.findMany({ where: { status: 'POSTED', docType: { in: [...docTypes] }, date: { gte: range.from, lte: range.to } }, include: { lines: true, party: { select: { id: true, name: true, gstin: true, stateCode: true } } } }),
    prisma.finVoucher.findMany({
      where: {
        status: 'POSTED', reversalOfId: null, date: { gte: range.from, lte: range.to },
        OR: [{ sourceType: null }, { sourceType: { notIn: ['DOCUMENT', ...NOT_SUPPLIES] } }],
        lines: { some: { accountId: { in: taxAccountIds } } },
      },
      include: { lines: true },
    }),
    prisma.finAccount.findMany({ select: { id: true, kind: true, requiresParty: true, systemKey: true, group: { select: { nature: true } } } }),
  ]);
  const accountOf = new Map(accounts.map((account) => [account.id, account]));
  const partyIds = Array.from(new Set(vouchers.flatMap((voucher) => [voucher.partyId, ...voucher.lines.map((line) => line.partyId)]).filter((id): id is string => Boolean(id))));
  const parties = await prisma.finParty.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true, gstin: true, stateCode: true } });
  const marginAccount = ids.get('VEHICLE_SALES_MARGIN');
  const rows: GstRow[] = [];

  for (const document of documents) {
    const sign = document.docType === 'CREDIT_NOTE' || document.docType === 'DEBIT_NOTE' ? -1 : 1;
    const ineligible = side === 'PURCHASES' ? round(document.lines.filter((line) => !line.itcEligible).reduce((sum, line) => sum + num(line.cgst) + num(line.sgst) + num(line.igst), 0)) : 0;
    const hsn = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
    for (const line of document.lines) {
      const key = `${line.hsnSac ?? ''}|${num(line.gstRate)}`;
      const entry = hsn.get(key) ?? { hsn: line.hsnSac ?? '', rate: num(line.gstRate), taxable: 0, tax: 0 };
      entry.taxable = round(entry.taxable + sign * num(line.taxableValue));
      entry.tax = round(entry.tax + sign * (num(line.cgst) + num(line.sgst) + num(line.igst)));
      hsn.set(key, entry);
    }
    const tax = { igst: round(sign * num(document.igst)), cgst: round(sign * num(document.cgst)), sgst: round(sign * num(document.sgst)) };
    const taxable = round(sign * num(document.subTotal));
    rows.push({
      key: `doc:${document.id}`, source: 'DOCUMENT', kind: document.docType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : document.docType === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'INVOICE',
      date: dateOnly(document.date)!, number: document.number, invoiceNo: (side === 'SALES' ? document.number : document.partyDocNumber) ?? document.number ?? '',
      partyId: document.partyId, partyName: document.party.name, gstin: document.party.gstin, placeOfSupply: document.placeOfSupply ?? document.party.stateCode,
      interState: !document.isIntraState, taxable, ...tax, tax: round(tax.igst + tax.cgst + tax.sgst), invoiceValue: round(sign * num(document.total)),
      reverseCharge: document.isReverseCharge, ineligibleTax: round(sign * ineligible), marginScheme: false, section: null, hsn: Array.from(hsn.values()),
    });
  }

  for (const voucher of vouchers) {
    const component = (accountId: string) => (Object.entries(taxIds).find(([, id]) => id === accountId)?.[0] ?? null) as keyof Tax | null;
    const tax: Tax = { igst: 0, cgst: 0, sgst: 0 };
    let taxable = 0;
    for (const line of voucher.lines) {
      const value = side === 'SALES' ? num(line.credit) - num(line.debit) : num(line.debit) - num(line.credit);
      const piece = component(line.accountId);
      if (piece) { tax[piece] = round(tax[piece] + value); continue; }
      const account = accountOf.get(line.accountId);
      if (!account || CASH_BANK_KINDS.includes(account.kind) || account.requiresParty || account.kind === 'TAX') continue;
      const nature = account.group.nature;
      if (side === 'SALES' ? nature === 'INCOME' : nature === 'EXPENSE' || nature === 'ASSET') taxable = round(taxable + value);
    }
    const totalTax = round(tax.igst + tax.cgst + tax.sgst);
    if (!totalTax) continue;
    const marginScheme = side === 'SALES' && Boolean(marginAccount) && voucher.lines.some((line) => line.accountId === marginAccount);
    if (marginScheme) taxable = round((totalTax * 100) / SELL_ACCOUNT_GST_RATE_PERCENT);
    const partyId = voucher.partyId ?? voucher.lines.find((line) => line.partyId)?.partyId ?? null;
    const party = parties.find((item) => item.id === partyId);
    const isNote = voucher.type === 'CREDIT_NOTE' || voucher.type === 'DEBIT_NOTE';
    rows.push({
      key: `voucher:${voucher.id}`, source: voucher.sourceType ?? 'MANUAL', kind: voucher.type === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : voucher.type === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'INVOICE',
      date: dateOnly(voucher.date)!, number: voucher.number, invoiceNo: voucher.reference ?? voucher.number ?? '', partyId, partyName: party?.name ?? null, gstin: party?.gstin ?? null,
      placeOfSupply: party?.stateCode ?? null, interState: tax.igst !== 0, taxable, ...tax, tax: totalTax, invoiceValue: round(taxable + totalTax), reverseCharge: false, ineligibleTax: 0,
      marginScheme, section: null, hsn: [],
    });
    if (isNote && rows[rows.length - 1]!.taxable > 0) rows[rows.length - 1]!.taxable = -rows[rows.length - 1]!.taxable;
  }
  for (const row of rows) {
    if (row.gstin && !isValidGstin(row.gstin)) row.gstin = null;
    if (side === 'SALES') row.section = gstr1Section({ gstin: row.gstin, isNote: row.kind !== 'INVOICE', interState: row.interState, invoiceValue: row.invoiceValue });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.number ?? '').localeCompare(b.number ?? ''));
};

export const getGstRegister = async (query: Record<string, unknown>) => {
  const side = query.side === 'PURCHASES' ? 'PURCHASES' : 'SALES';
  const range = readRange(query);
  const rows = await gstRegister(side, range);
  const sum = (key: 'taxable' | 'igst' | 'cgst' | 'sgst' | 'tax' | 'ineligibleTax') => round(rows.reduce((total, row) => total + row[key], 0));
  return { side, from: dateOnly(range.from), to: dateOnly(range.to), rows, totals: { taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'), tax: sum('tax'), ineligibleTax: sum('ineligibleTax') } };
};

/** Movement (or balance up to `to`) of each GST ledger, Cr-positive for output, Dr-positive for input. */
const gstLedgerFigures = async (range: { from?: Date; to: Date }, excludeMovements: boolean) => {
  const ids = await systemIds();
  const keys = [...Object.values(OUTPUT), ...Object.values(INPUT), 'GST_RCM_PAYABLE'];
  const rows = await prisma.finVoucherLine.groupBy({
    by: ['accountId'],
    where: {
      accountId: { in: keys.map((key) => ids.get(key)).filter((id): id is string => Boolean(id)) },
      voucher: { status: { in: LEDGER_STATUSES }, date: { ...(range.from ? { gte: range.from } : {}), lte: range.to }, ...(excludeMovements ? { OR: [{ sourceType: null }, { sourceType: { notIn: NOT_SUPPLIES } }] } : {}) },
    },
    _sum: { debit: true, credit: true },
  });
  const figure = (key: string, creditPositive: boolean) => {
    const row = rows.find((item) => item.accountId === ids.get(key));
    const net = num(row?._sum.debit) - num(row?._sum.credit);
    return round(creditPositive ? -net : net);
  };
  return {
    output: { igst: figure(OUTPUT.igst, true), cgst: figure(OUTPUT.cgst, true), sgst: figure(OUTPUT.sgst, true) },
    input: { igst: figure(INPUT.igst, false), cgst: figure(INPUT.cgst, false), sgst: figure(INPUT.sgst, false) },
    rcm: figure('GST_RCM_PAYABLE', true),
  };
};

/** GSTR-3B / GSTR-1 working for a month, checked against the GST ledgers. */
export const getGstSummary = async (query: Record<string, unknown>) => {
  const range = monthRange(query);
  const [sales, purchases, movement, closing, draftDocuments, draftVouchers, upload] = await Promise.all([
    gstRegister('SALES', range),
    gstRegister('PURCHASES', range),
    gstLedgerFigures(range, true),
    gstLedgerFigures({ to: range.to }, false),
    prisma.finDocument.count({ where: { status: 'DRAFT', date: { gte: range.from, lte: range.to } } }),
    prisma.finVoucher.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] }, date: { gte: range.from, lte: range.to } } }),
    prisma.finGstr2bUpload.findUnique({ where: { period: range.key }, select: { rowCount: true, updatedAt: true } }),
  ]);
  const add = (rows: GstRow[], pick: (row: GstRow) => boolean = () => true) => {
    const chosen = rows.filter(pick);
    return { count: chosen.length, taxable: round(chosen.reduce((sum, row) => sum + row.taxable, 0)), igst: round(chosen.reduce((sum, row) => sum + row.igst, 0)), cgst: round(chosen.reduce((sum, row) => sum + row.cgst, 0)), sgst: round(chosen.reduce((sum, row) => sum + row.sgst, 0)) };
  };
  const outward = add(sales);
  const rcmInward = add(purchases, (row) => row.reverseCharge);
  const itcOther = add(purchases, (row) => !row.reverseCharge);
  const ineligible = round(purchases.reduce((sum, row) => sum + row.ineligibleTax, 0));
  const registerOutput = { igst: outward.igst, cgst: outward.cgst, sgst: outward.sgst };
  const registerInput = { igst: round(rcmInward.igst + itcOther.igst), cgst: round(rcmInward.cgst + itcOther.cgst), sgst: round(rcmInward.sgst + itcOther.sgst) };
  const diff = (a: Tax, b: Tax) => ({ igst: round(a.igst - b.igst), cgst: round(a.cgst - b.cgst), sgst: round(a.sgst - b.sgst) });
  const preview = setOff(closing.input, closing.output);
  const sections = ['B2B', 'B2CL', 'B2CS', 'CDNR', 'CDNUR'].map((section) => ({ section, ...add(sales, (row) => row.section === section) }));
  const hsn = new Map<string, { hsn: string; rate: number; taxable: number; tax: number }>();
  for (const row of sales) {
    const lines = row.hsn.length ? row.hsn : [{ hsn: row.marginScheme ? 'Margin scheme (vehicles)' : '—', rate: row.taxable ? round((row.tax / row.taxable) * 100) : 0, taxable: row.taxable, tax: row.tax }];
    for (const line of lines) {
      const key = `${line.hsn}|${line.rate}`;
      const entry = hsn.get(key) ?? { hsn: line.hsn, rate: line.rate, taxable: 0, tax: 0 };
      entry.taxable = round(entry.taxable + line.taxable);
      entry.tax = round(entry.tax + line.tax);
      hsn.set(key, entry);
    }
  }
  const invalidB2b = sales.filter((row) => !row.gstin && row.partyName && row.section === 'B2CL').length;
  return {
    month: range.key,
    gstr3b: {
      outwardTaxable: outward,
      inwardReverseCharge: { ...rcmInward, liability: movement.rcm },
      itc: { reverseCharge: rcmInward, other: itcOther, ineligible, net: { igst: registerInput.igst, cgst: registerInput.cgst, sgst: registerInput.sgst } },
    },
    gstr1: { sections, hsn: Array.from(hsn.values()).sort((a, b) => b.taxable - a.taxable) },
    ledger: { movement, closing, outputDifference: diff(registerOutput, movement.output), inputDifference: diff(registerInput, movement.input) },
    setOffPreview: { ...preview, rcmCash: closing.rcm },
    readiness: [
      { check: 'Draft purchase / sales documents dated in the month', count: draftDocuments, ok: draftDocuments === 0 },
      { check: 'Draft or pending vouchers dated in the month (includes automatic drafts in shadow mode)', count: draftVouchers, ok: draftVouchers === 0 },
      { check: 'Large inter-state sales without a buyer GSTIN (B2CL)', count: invalidB2b, ok: true },
      { check: 'GSTR-2B uploaded for ITC matching', count: upload?.rowCount ?? 0, ok: Boolean(upload) },
    ],
  };
};

/** Uses input credit against output tax as of month end (Rule 88A order) in one journal. */
export const postGstSetOff = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const range = monthRange(body);
  const closing = await gstLedgerFigures({ to: range.to }, false);
  const result = setOff(closing.input, closing.output);
  if (!result.uses.length) throw badRequest('Nothing to set off: no input credit against output tax at month end.');
  const ids = await systemIds();
  const lines = result.uses.flatMap((use) => [
    vline(ids.get(OUTPUT[use.to])!, new Prisma.Decimal(use.amount), ZERO, { narration: `${use.to.toUpperCase()} liability from ${use.from.toUpperCase()} credit` }),
    vline(ids.get(INPUT[use.from])!, ZERO, new Prisma.Decimal(use.amount), { narration: `${use.from.toUpperCase()} credit used` }),
  ]);
  const existing = await prisma.finVoucher.count({ where: { sourceType: 'GST_SETOFF', sourceId: range.key } });
  const voucher = await prisma.$transaction((tx) => postSystemVoucher(tx, {
    type: 'JOURNAL', date: range.to > istToday() ? istToday() : range.to, narration: `GST set-off of input tax credit for ${range.key}`, lines,
    sourceType: 'GST_SETOFF', sourceId: range.key, sourceEvent: 'SETOFF', idempotencyKey: `gst-setoff:${range.key}:${existing + 1}`,
  }, access), { timeout: 30000 });
  await writeFinAudit({ ...access.actor, entityType: 'FinGstSetOff', entityId: range.key, action: 'POST', after: { number: voucher.number, uses: result.uses } });
  return { number: voucher.number, uses: result.uses, cashPayable: result.cashPayable, creditCarriedForward: result.creditCarriedForward };
};

// ---------------------------------------------------------------------------
// GSTR-2B
// ---------------------------------------------------------------------------

export const upload2b = async (body: Record<string, unknown>, context: ActorContext) => {
  const range = monthRange(body);
  let rows: PortalPurchase[] = [];
  if (body.json) rows = parse2bJson(body.json);
  else if (Array.isArray(body.rows)) {
    rows = (body.rows as Array<Record<string, unknown>>).map((row) => ({
      gstin: String(row.gstin ?? '').toUpperCase().trim(), supplierName: row.supplierName ? String(row.supplierName) : null, invoiceNo: String(row.invoiceNo ?? '').trim(), date: String(row.date ?? ''),
      taxable: Number(row.taxable) || 0, igst: Number(row.igst) || 0, cgst: Number(row.cgst) || 0, sgst: Number(row.sgst) || 0,
    })).filter((row) => row.gstin && row.invoiceNo);
  }
  if (!rows.length) throw badRequest('No invoices found. Upload the GSTR-2B JSON from the GST portal, or a CSV with GSTIN, invoice number, date, taxable, IGST, CGST, SGST.');
  if (rows.length > 20000) throw badRequest('Too many rows.');
  const fileName = readString(body, 'fileName', 'File', { max: 200 });
  await prisma.finGstr2bUpload.upsert({ where: { period: range.key }, create: { period: range.key, fileName, rows, rowCount: rows.length, uploadedById: context.actorUserId }, update: { fileName, rows, rowCount: rows.length, uploadedById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinGstr2bUpload', entityId: range.key, action: 'UPLOAD', after: { rows: rows.length, fileName } });
  return { period: range.key, rows: rows.length };
};

/** 2B of a month against purchase bills from the start of the financial year to month end. */
export const get2bReconciliation = async (query: Record<string, unknown>) => {
  const range = monthRange(query);
  const upload = await prisma.finGstr2bUpload.findUnique({ where: { period: range.key } });
  const purchases = await gstRegister('PURCHASES', { from: financialYearOf(range.to).startDate, to: range.to });
  const books = purchases.filter((row) => row.gstin && row.kind === 'INVOICE' && !row.reverseCharge).map((row) => ({ key: row.key, gstin: row.gstin!, invoiceNo: row.invoiceNo, date: row.date, taxable: row.taxable, tax: row.tax }));
  const portal = upload ? (upload.rows as unknown as PortalPurchase[]) : [];
  // Bills since the start of the year are matched, so a late-filed supplier invoice still finds its bill.
  const results = match2b(books, portal);
  const count = (status: string) => results.filter((row) => row.status === status).length;
  return {
    month: range.key,
    uploaded: upload ? { fileName: upload.fileName, rows: upload.rowCount, at: upload.updatedAt } : null,
    summary: { matched: count('MATCHED'), mismatch: count('AMOUNT_MISMATCH'), onlyIn2b: count('ONLY_IN_2B'), onlyInBooks: count('ONLY_IN_BOOKS'), itcIn2b: round(portal.reduce((sum, row) => sum + row.igst + row.cgst + row.sgst, 0)), itcInBooks: round(books.filter((row) => row.date >= dateOnly(range.from)!).reduce((sum, row) => sum + row.tax, 0)) },
    results,
  };
};

// ---------------------------------------------------------------------------
// TDS / TCS
// ---------------------------------------------------------------------------

const SECTION_PATTERN = /\b(19[0-9][A-Z]{0,3}|206C[A-Z0-9]*)\b/i;

/** Deducted / collected (credits) and deposited (debits) on a TDS or TCS ledger, by section and party. */
export const getWithholdingRegister = async (query: Record<string, unknown>) => {
  const kind = query.kind === 'TCS' ? 'TCS' : 'TDS';
  const side = query.side === 'RECEIVABLE' ? 'RECEIVABLE' : 'PAYABLE';
  const range = readRange(query);
  const account = await prisma.finAccount.findUnique({ where: { systemKey: `${kind}_${side}` }, select: { id: true, code: true, name: true } });
  if (!account) throw notFound(`${kind} ${side.toLowerCase()} ledger is missing.`);
  const lines = await prisma.finVoucherLine.findMany({
    where: { accountId: account.id, voucher: { status: { in: LEDGER_STATUSES }, date: { gte: range.from, lte: range.to } } },
    include: { voucher: { select: { id: true, number: true, date: true, narration: true, sourceType: true, sourceId: true, reference: true, partyId: true } }, party: { select: { id: true, name: true, pan: true } } },
    orderBy: [{ voucher: { date: 'asc' } }, { lineNo: 'asc' }],
    take: 5000,
  });
  const documentIds = lines.flatMap((line) => (line.voucher.sourceType === 'DOCUMENT' && line.voucher.sourceId ? [line.voucher.sourceId] : []));
  const settlementIds = lines.flatMap((line) => (line.voucher.sourceType === 'SETTLEMENT' && line.voucher.sourceId ? [line.voucher.sourceId] : []));
  const [documents, settlements, voucherParties, opening] = await Promise.all([
    documentIds.length ? prisma.finDocument.findMany({ where: { id: { in: documentIds } }, select: { id: true, tdsSection: true } }) : [],
    settlementIds.length ? prisma.finPartnerSettlement.findMany({ where: { id: { in: settlementIds } }, select: { id: true, tdsSection: true } }) : [],
    prisma.finParty.findMany({ where: { id: { in: lines.flatMap((line) => (line.voucher.partyId ? [line.voucher.partyId] : [])) } }, select: { id: true, name: true, pan: true } }),
    prisma.finVoucherLine.aggregate({ where: { accountId: account.id, voucher: { status: { in: LEDGER_STATUSES }, date: { lt: range.from } } }, _sum: { debit: true, credit: true } }),
  ]);
  const payable = side === 'PAYABLE';
  const rows = lines.map((line) => {
    const section = documents.find((item) => item.id === line.voucher.sourceId)?.tdsSection
      ?? settlements.find((item) => item.id === line.voucher.sourceId)?.tdsSection
      ?? (line.narration ?? line.voucher.narration).match(SECTION_PATTERN)?.[1]?.toUpperCase() ?? 'UNSPECIFIED';
    const party = line.party ?? voucherParties.find((item) => item.id === line.voucher.partyId) ?? null;
    const increase = payable ? num(line.credit) - num(line.debit) : num(line.debit) - num(line.credit);
    return {
      id: line.id, date: dateOnly(line.voucher.date), voucherId: line.voucher.id, voucherNumber: line.voucher.number, narration: line.voucher.narration, section,
      party: party ? { id: party.id, name: party.name, pan: party.pan } : null,
      movement: line.voucher.sourceType === 'TAX_CHALLAN' ? 'DEPOSITED' : increase >= 0 ? (payable ? 'DEDUCTED' : 'DEDUCTED_BY_PARTY') : 'ADJUSTED',
      amount: round(Math.abs(increase)),
      signed: round(increase),
    };
  });
  const sections = new Map<string, { section: string; deducted: number; deposited: number; parties: Set<string> }>();
  for (const row of rows) {
    const entry = sections.get(row.section) ?? { section: row.section, deducted: 0, deposited: 0, parties: new Set<string>() };
    if (row.signed >= 0) entry.deducted = round(entry.deducted + row.signed);
    else entry.deposited = round(entry.deposited - row.signed);
    if (row.party) entry.parties.add(row.party.id);
    sections.set(row.section, entry);
  }
  const openingNet = payable ? num(opening._sum.credit) - num(opening._sum.debit) : num(opening._sum.debit) - num(opening._sum.credit);
  const movementNet = rows.reduce((sum, row) => sum + row.signed, 0);
  return {
    kind, side, account, from: dateOnly(range.from), to: dateOnly(range.to),
    opening: round(openingNet), closing: round(openingNet + movementNet),
    sections: Array.from(sections.values()).map((entry) => ({ section: entry.section, deducted: entry.deducted, deposited: entry.deposited, parties: entry.parties.size, balance: round(entry.deducted - entry.deposited) })),
    rows,
  };
};

// ---------------------------------------------------------------------------
// Challans
// ---------------------------------------------------------------------------

const CHALLAN_LEDGERS: Record<FinTaxType, Record<string, string>> = {
  GST: { igst: OUTPUT.igst, cgst: OUTPUT.cgst, sgst: OUTPUT.sgst, rcm: 'GST_RCM_PAYABLE' },
  TDS: { principal: 'TDS_PAYABLE' },
  TCS: { principal: 'TCS_PAYABLE' },
  ADVANCE_TAX: { principal: 'ADVANCE_TAX' },
  SELF_ASSESSMENT: { principal: 'INCOME_TAX_PROVISION' },
  PROFESSIONAL_TAX: { principal: 'PT_PAYABLE' },
  PF: { principal: 'PF_PAYABLE' },
  ESI: { principal: 'ESI_PAYABLE' },
  OTHER: {},
};

export const createChallan = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const taxType = readEnum(body, 'taxType', 'Tax', Object.values(FinTaxType));
  const period = readString(body, 'period', 'Period', { max: 20, required: true })!;
  const challanNo = readString(body, 'challanNo', 'Challan / CIN / CPIN', { max: 40, required: true })!.toUpperCase();
  const bsrCode = readString(body, 'bsrCode', 'BSR code', { max: 10 });
  const date = readDate(body, 'date', 'Payment date', true)!;
  const bankAccountId = readString(body, 'bankAccountId', 'Paid from', { max: 60, required: true })!;
  const proofUrl = readString(body, 'proofUrl', 'Challan link', { max: 500 });
  const notes = readMultiline(body, 'notes', 'Notes', 1000);
  const raw = (body.breakdown && typeof body.breakdown === 'object' ? body.breakdown : {}) as Record<string, unknown>;
  const breakdown: Record<string, number> = {};
  const ids = await systemIds();
  const penalty = await prisma.finAccount.findUnique({ where: { code: '6920' }, select: { id: true } });
  const lines: VoucherLineInput[] = [];
  const otherAccountId = readString(body, 'otherAccountId', 'Ledger', { max: 60 });
  for (const [key, ledgerKey] of Object.entries({ ...CHALLAN_LEDGERS[taxType], interest: '', fee: '', ...(taxType === 'OTHER' ? { principal: '' } : {}) })) {
    const amount = readMoney(raw, key, key) ?? ZERO;
    if (!amount.greaterThan(0)) continue;
    breakdown[key] = amount.toNumber();
    const accountId = key === 'interest' || key === 'fee' ? penalty?.id : taxType === 'OTHER' ? otherAccountId : ids.get(ledgerKey);
    if (!accountId) throw badRequest(key === 'interest' || key === 'fee' ? 'Ledger 6920 Interest & Penalty is missing.' : taxType === 'OTHER' ? 'Choose the ledger the payment clears.' : `Ledger ${ledgerKey} is missing.`);
    lines.push(vline(accountId, amount, ZERO, { narration: `${taxType} ${key} ${period}` }));
  }
  if (!lines.length) throw badRequest('Enter at least one amount.');
  const total = roundMoney(lines.reduce((sum, line) => sum.plus(line.debit), ZERO));
  const bank = await prisma.finAccount.findUnique({ where: { id: bankAccountId }, select: { kind: true, isActive: true } });
  if (!bank?.isActive || !CASH_BANK_KINDS.includes(bank.kind)) throw badRequest('Choose a bank account.');
  lines.push(vline(bankAccountId, ZERO, total));
  return prisma.$transaction(async (tx) => {
    const id = randomUUID();
    const voucher = await postSystemVoucher(tx, {
      type: 'PAYMENT', date, narration: `${taxType.replace(/_/g, ' ')} paid for ${period} (challan ${challanNo})`, reference: challanNo, paymentMethod: 'BANK_TRANSFER', lines,
      sourceType: 'TAX_CHALLAN', sourceId: id, sourceEvent: taxType, idempotencyKey: `challan:${taxType}:${challanNo}`,
    }, access);
    await tx.finTaxChallan.create({ data: { id, taxType, period, challanNo, bsrCode, date, total, breakdown, bankAccountId, voucherId: voucher.id, proofUrl, notes, createdById: access.actor.actorUserId } });
    await writeFinAudit({ ...access.actor, entityType: 'FinTaxChallan', entityId: id, action: 'CREATE', after: { taxType, period, total: total.toNumber(), number: voucher.number } }, tx);
    return { id, number: voucher.number, total: total.toNumber() };
  }, { timeout: 30000 });
};

export const listChallans = async (query: Record<string, unknown>) => {
  const challans = await prisma.finTaxChallan.findMany({ where: { ...(typeof query.taxType === 'string' && query.taxType ? { taxType: query.taxType as FinTaxType } : {}) }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500 });
  const vouchers = await prisma.finVoucher.findMany({ where: { id: { in: challans.map((item) => item.voucherId) } }, select: { id: true, number: true, status: true } });
  return challans.map((item) => ({ ...item, date: dateOnly(item.date), total: num(item.total), voucher: vouchers.find((voucher) => voucher.id === item.voucherId) ?? null }));
};

// ---------------------------------------------------------------------------
// E-invoice / e-way bill references
// ---------------------------------------------------------------------------

export const listEInvoices = async (query: Record<string, unknown>) => {
  const range = readRange(query);
  const rows = (await gstRegister('SALES', range)).filter((row) => row.kind === 'INVOICE');
  const keyOf = (row: GstRow) => (row.source === 'DOCUMENT' ? { sourceKind: 'DOCUMENT', sourceId: row.key.slice(4) } : { sourceKind: 'VOUCHER', sourceId: row.key.slice(8) });
  const refs = await prisma.finTaxDocRef.findMany({ where: { OR: rows.map((row) => keyOf(row)) } });
  return rows.map((row) => {
    const key = keyOf(row);
    const ref = refs.find((item) => item.sourceKind === key.sourceKind && item.sourceId === key.sourceId);
    return {
      ...key, date: row.date, number: row.number, invoiceNo: row.invoiceNo, partyName: row.partyName, gstin: row.gstin, section: row.section, invoiceValue: row.invoiceValue, interState: row.interState,
      ref: ref ? { ...ref, ackDate: dateOnly(ref.ackDate), ewbDate: dateOnly(ref.ewbDate), ewbValidUpto: dateOnly(ref.ewbValidUpto) } : null,
      eInvoiceExpected: row.section === 'B2B',
    };
  });
};

export const saveTaxDocRef = async (body: Record<string, unknown>, context: ActorContext) => {
  const sourceKind = readEnum(body, 'sourceKind', 'Source', ['DOCUMENT', 'VOUCHER']);
  const sourceId = readString(body, 'sourceId', 'Invoice', { max: 60, required: true })!;
  const irn = readString(body, 'irn', 'IRN', { max: 64 });
  if (irn && !/^[a-f0-9]{64}$/i.test(irn)) throw badRequest('IRN is a 64-character hash.');
  const ewbNo = readString(body, 'ewbNo', 'E-way bill number', { max: 20 });
  if (ewbNo && !/^\d{12}$/.test(ewbNo)) throw badRequest('E-way bill number has 12 digits.');
  const data = {
    irn: irn?.toLowerCase() ?? null, ackNo: readString(body, 'ackNo', 'Ack number', { max: 30 }), ackDate: readDate(body, 'ackDate', 'Ack date'),
    ewbNo, ewbDate: readDate(body, 'ewbDate', 'E-way bill date'), ewbValidUpto: readDate(body, 'ewbValidUpto', 'Valid up to'),
    status: readEnum(body, 'status', 'Status', ['PENDING', 'GENERATED', 'CANCELLED', 'NOT_REQUIRED'], irn || ewbNo ? 'GENERATED' : 'PENDING'),
    notes: readMultiline(body, 'notes', 'Notes', 1000), updatedById: context.actorUserId,
  };
  const ref = await prisma.finTaxDocRef.upsert({ where: { sourceKind_sourceId: { sourceKind, sourceId } }, create: { sourceKind, sourceId, ...data }, update: data });
  await writeFinAudit({ ...context, entityType: 'FinTaxDocRef', entityId: ref.id, action: 'SAVE', after: { irn: data.irn, ewbNo, status: data.status } });
  return { id: ref.id };
};

// ---------------------------------------------------------------------------
// Income tax
// ---------------------------------------------------------------------------

export const getIncomeTax = async (query: Record<string, unknown>) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const fy = financialYearOf(to);
  const ids = await systemIds();
  const balance = async (key: string, from?: Date) => {
    const id = ids.get(key);
    if (!id) return 0;
    const sums = await prisma.finVoucherLine.aggregate({ where: { accountId: id, voucher: { status: { in: LEDGER_STATUSES }, date: { ...(from ? { gte: from } : {}), lte: to } } }, _sum: { debit: true, credit: true } });
    return round(num(sums._sum.debit) - num(sums._sum.credit));
  };
  const [provision, advanceTax, tdsReceivable, expense, provisions, challans] = await Promise.all([
    balance('INCOME_TAX_PROVISION'), balance('ADVANCE_TAX'), balance('TDS_RECEIVABLE'), balance('INCOME_TAX_EXPENSE', fy.startDate),
    prisma.finVoucher.findMany({ where: { sourceType: 'TAX_PROVISION', status: { in: LEDGER_STATUSES } }, orderBy: { date: 'desc' }, take: 50, select: { id: true, number: true, date: true, narration: true, totalAmount: true } }),
    prisma.finTaxChallan.findMany({ where: { taxType: { in: ['ADVANCE_TAX', 'SELF_ASSESSMENT'] } }, orderBy: { date: 'desc' }, take: 50 }),
  ]);
  return {
    fy: { start: dateOnly(fy.startDate), end: dateOnly(fy.endDate) },
    provision: -provision, advanceTax, tdsReceivable, expenseThisYear: expense,
    provisions: provisions.map((voucher) => ({ ...voucher, date: dateOnly(voucher.date), totalAmount: num(voucher.totalAmount) })),
    challans: challans.map((item) => ({ ...item, date: dateOnly(item.date), total: num(item.total) })),
  };
};

export const bookTaxProvision = async (body: Record<string, unknown>, access: LedgerAccess) => {
  const date = readDate(body, 'date', 'Date', true)!;
  const amount = readMoney(body, 'amount', 'Amount', { allowNegative: true }) ?? ZERO;
  if (amount.isZero()) throw badRequest('Amount cannot be zero.');
  const narration = readMultiline(body, 'narration', 'Narration', 500) ?? `Provision for income tax${amount.lessThan(0) ? ' reversed' : ''}`;
  const ids = await systemIds();
  const expense = ids.get('INCOME_TAX_EXPENSE');
  const provision = ids.get('INCOME_TAX_PROVISION');
  if (!expense || !provision) throw badRequest('Income Tax Expense / Provision ledgers are missing. Run "Install default chart".');
  const value = amount.abs();
  const lines = amount.greaterThan(0) ? [vline(expense, value, ZERO), vline(provision, ZERO, value)] : [vline(provision, value, ZERO), vline(expense, ZERO, value)];
  const id = randomUUID();
  const voucher = await prisma.$transaction((tx) => postSystemVoucher(tx, { type: 'JOURNAL', date, narration, lines, sourceType: 'TAX_PROVISION', sourceId: id, sourceEvent: 'PROVISION' }, access), { timeout: 30000 });
  await writeFinAudit({ ...access.actor, entityType: 'FinTaxProvision', entityId: id, action: 'POST', after: { amount: amount.toNumber(), number: voucher.number } });
  return { number: voucher.number };
};
