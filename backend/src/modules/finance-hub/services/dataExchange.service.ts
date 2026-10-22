import { createHash } from 'node:crypto';
import prisma from '../../../lib/prisma';
import { badRequest } from '../http';
import { financialYearOf, istToday } from '../utils/fy';
import { dateOnly, readDate } from '../utils/input';
import { writeFinAudit } from './audit.service';
import type { ActorContext } from './context';
import { LEDGER_STATUSES } from './ledgerRules';
import { createVoucher, postVoucher, type LedgerAccess } from './ledger.service';
import { saveOpeningBalances } from './openingBalances.service';
import { getPartyBalances } from './receivables.service';
import { getTrialBalance } from './reports.service';
import { gstRegister, getWithholdingRegister } from './tax.service';

// Controlled data exchange: voucher / opening-balance imports (dry run first), CSV exports,
// Tally XML export and the history of every batch.

const MANUAL_TYPES = ['JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'ADJUSTMENT'];
const round = (value: number) => Math.round(value * 100) / 100;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '');
const amount = (value: unknown) => {
  const parsed = Number(text(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? round(parsed) : NaN;
};
/** dd-mm-yyyy, dd/mm/yyyy or yyyy-mm-dd → yyyy-mm-dd. */
const isoDate = (value: unknown) => {
  const raw = text(value);
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, '0')}-${dmy[1]!.padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const lookups = async () => {
  const [accounts, parties, centres] = await Promise.all([
    prisma.finAccount.findMany({ select: { id: true, code: true, name: true, isActive: true, allowManualPosting: true, requiresParty: true, requiresVehicle: true, requiresCostCentre: true } }),
    prisma.finParty.findMany({ select: { id: true, code: true, name: true } }),
    prisma.finCostCentre.findMany({ select: { id: true, code: true } }),
  ]);
  const byCode = new Map(accounts.map((account) => [account.code.toUpperCase(), account]));
  const byName = new Map(accounts.map((account) => [account.name.toLowerCase(), account]));
  const partyByCode = new Map(parties.map((party) => [party.code.toUpperCase(), party]));
  const partyByName = new Map(parties.map((party) => [party.name.toLowerCase(), party]));
  return {
    account: (value: string) => byCode.get(value.toUpperCase()) ?? byName.get(value.toLowerCase()),
    party: (value: string) => partyByCode.get(value.toUpperCase()) ?? partyByName.get(value.toLowerCase()),
    centre: (value: string) => centres.find((item) => item.code.toUpperCase() === value.toUpperCase()),
  };
};

type ImportResult = { ref: string; ok: boolean; errors: string[]; voucherId?: string; number?: string | null; status?: string; hash: string; duplicate?: boolean };

/**
 * Journal / payment / receipt rows grouped into vouchers by their `ref`. Dry run validates only;
 * a real run creates drafts (posted too when `post` is set and allowed). A voucher already
 * imported (same ref, date and lines) is skipped.
 */
export const importVouchers = async (body: Record<string, unknown>, access: LedgerAccess & { canPost: boolean }) => {
  const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
  if (!rows.length) throw badRequest('No rows to import.');
  if (rows.length > 5000) throw badRequest('Up to 5,000 rows per import.');
  const dryRun = body.dryRun !== false;
  const post = body.post === true && access.canPost;
  const find = await lookups();
  const groups = new Map<string, Array<Record<string, unknown> & { row: number }>>();
  rows.forEach((row, index) => {
    const ref = text(row.ref) || `row-${index + 1}`;
    groups.set(ref, [...(groups.get(ref) ?? []), { ...row, row: index + 2 }]);
  });
  const previous = await prisma.finImportBatch.findMany({ where: { kind: 'VOUCHERS', dryRun: false }, select: { results: true } });
  const seen = new Set(previous.flatMap((batch) => (batch.results as Array<{ hash?: string; ok?: boolean }>).filter((item) => item.ok && item.hash).map((item) => item.hash!)));
  const results: ImportResult[] = [];
  for (const [ref, lines] of groups) {
    const errors: string[] = [];
    const first = lines[0]!;
    const date = isoDate(first.date);
    const type = text(first.type).toUpperCase() || 'JOURNAL';
    if (!date) errors.push(`Row ${first.row}: date must be dd-mm-yyyy or yyyy-mm-dd.`);
    if (!MANUAL_TYPES.includes(type)) errors.push(`Row ${first.row}: type must be one of ${MANUAL_TYPES.join(', ')}.`);
    const narration = text(first.narration) || `Imported ${ref}`;
    const mapped = lines.map((line) => {
      const account = find.account(text(line.account));
      const debit = amount(line.debit || 0);
      const credit = amount(line.credit || 0);
      if (!account) errors.push(`Row ${line.row}: ledger "${text(line.account)}" not found (use the ledger code).`);
      else if (!account.isActive || !account.allowManualPosting) errors.push(`Row ${line.row}: ${account.name} cannot be used in a manual voucher.`);
      if (Number.isNaN(debit) || Number.isNaN(credit) || debit < 0 || credit < 0) errors.push(`Row ${line.row}: debit / credit must be positive numbers.`);
      if (debit && credit) errors.push(`Row ${line.row}: enter either debit or credit.`);
      const party = text(line.party) ? find.party(text(line.party)) : null;
      if (text(line.party) && !party) errors.push(`Row ${line.row}: party "${text(line.party)}" not found.`);
      if (account?.requiresParty && !party) errors.push(`Row ${line.row}: ${account.name} needs a party.`);
      const centre = text(line.costCentre) ? find.centre(text(line.costCentre)) : null;
      if (account?.requiresCostCentre && !centre) errors.push(`Row ${line.row}: ${account.name} needs a cost centre.`);
      if (account?.requiresVehicle) errors.push(`Row ${line.row}: ${account.name} needs a vehicle; enter such vouchers on screen.`);
      return { accountId: account?.id ?? '', partyId: party?.id ?? null, sellAccountId: null, costCentreId: centre?.id ?? null, debit: debit || null, credit: credit || null, narration: text(line.lineNarration) || null };
    });
    const debitTotal = round(mapped.reduce((sum, line) => sum + (line.debit ?? 0), 0));
    const creditTotal = round(mapped.reduce((sum, line) => sum + (line.credit ?? 0), 0));
    if (debitTotal !== creditTotal) errors.push(`Voucher ${ref}: debit ${debitTotal} and credit ${creditTotal} differ.`);
    if (mapped.length < 2) errors.push(`Voucher ${ref}: needs at least two lines.`);
    const hash = createHash('sha1').update(JSON.stringify([ref, date, type, mapped.map((line) => [line.accountId, line.partyId, line.debit, line.credit])])).digest('hex');
    if (seen.has(hash)) {
      results.push({ ref, ok: false, errors: ['Already imported earlier (skipped).'], hash, duplicate: true });
      continue;
    }
    if (errors.length || dryRun) {
      results.push({ ref, ok: !errors.length, errors, hash });
      continue;
    }
    try {
      const draft = await createVoucher({ type, date, narration, reference: text(first.reference) || ref.slice(0, 80), paymentMethod: text(first.paymentMethod) || null, lines: mapped }, access);
      const posted = post ? await postVoucher(draft.id, access) : { status: draft.status, number: null };
      seen.add(hash);
      results.push({ ref, ok: true, errors: [], voucherId: draft.id, number: posted.number, status: posted.status, hash });
    } catch (error) {
      results.push({ ref, ok: false, errors: [(error as Error).message], hash });
    }
  }
  const batch = await prisma.finImportBatch.create({
    data: { kind: 'VOUCHERS', fileName: text(body.fileName).slice(0, 200) || null, dryRun, totalRows: rows.length, created: dryRun ? 0 : results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, errors: results.filter((item) => !item.ok).map((item) => ({ ref: item.ref, errors: item.errors })), results: results.map((item) => ({ ref: item.ref, ok: item.ok, hash: item.hash, voucherId: item.voucherId ?? null, number: item.number ?? null })), createdById: access.actor.actorUserId },
  });
  await writeFinAudit({ ...access.actor, entityType: 'FinImportBatch', entityId: batch.id, action: dryRun ? 'IMPORT_CHECK' : 'IMPORT', after: { vouchers: results.length, ok: results.filter((item) => item.ok).length } });
  return { batchId: batch.id, dryRun, vouchers: results.length, ok: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, results };
};

/** Opening balances from a sheet (ledger code, party code, debit, credit, bill ref / dates). */
export const importOpeningBalances = async (body: Record<string, unknown>, context: ActorContext) => {
  const yearId = text(body.yearId);
  if (!yearId) throw badRequest('Choose the financial year.');
  const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
  if (!rows.length) throw badRequest('No rows to import.');
  const dryRun = body.dryRun !== false;
  const find = await lookups();
  const errors: Array<{ row: number; error: string }> = [];
  const lines = rows.map((row, index) => {
    const account = find.account(text(row.account));
    if (!account) errors.push({ row: index + 2, error: `Ledger "${text(row.account)}" not found.` });
    const party = text(row.party) ? find.party(text(row.party)) : null;
    if (text(row.party) && !party) errors.push({ row: index + 2, error: `Party "${text(row.party)}" not found.` });
    const debit = amount(row.debit || 0);
    const credit = amount(row.credit || 0);
    if (Number.isNaN(debit) || Number.isNaN(credit)) errors.push({ row: index + 2, error: 'Debit / credit must be numbers.' });
    return { accountId: account?.id ?? '', partyId: party?.id ?? null, debit: debit || null, credit: credit || null, billRef: text(row.billRef) || null, billDate: isoDate(row.billDate) || null, dueDate: isoDate(row.dueDate) || null, note: text(row.note).slice(0, 200) || null };
  });
  let merged = lines;
  if (body.mode === 'merge') {
    const existing = await prisma.finOpeningBalance.findMany({ where: { yearId } });
    const key = (line: { accountId: string; partyId: string | null; billRef: string | null }) => `${line.accountId}|${line.partyId ?? ''}|${line.billRef ?? ''}`;
    const incoming = new Set(lines.map(key));
    merged = [...existing.filter((line) => !incoming.has(key(line))).map((line) => ({ accountId: line.accountId, partyId: line.partyId, debit: line.debit.toNumber() || null, credit: line.credit.toNumber() || null, billRef: line.billRef, billDate: dateOnly(line.billDate), dueDate: dateOnly(line.dueDate), note: line.note })), ...lines];
  }
  const debit = round(merged.reduce((sum, line) => sum + (line.debit ?? 0), 0));
  const credit = round(merged.reduce((sum, line) => sum + (line.credit ?? 0), 0));
  let saved = false;
  if (!dryRun && !errors.length) {
    await saveOpeningBalances(yearId, { lines: merged }, context);
    saved = true;
  }
  const batch = await prisma.finImportBatch.create({ data: { kind: 'OPENING_BALANCES', fileName: text(body.fileName).slice(0, 200) || null, dryRun, totalRows: rows.length, created: saved ? lines.length : 0, failed: errors.length, errors, createdById: context.actorUserId } });
  await writeFinAudit({ ...context, entityType: 'FinImportBatch', entityId: batch.id, action: dryRun ? 'IMPORT_CHECK' : 'IMPORT', after: { rows: rows.length, saved } });
  return { batchId: batch.id, dryRun, saved, errors, lines: merged.length, totals: { debit, credit, difference: round(debit - credit) } };
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const csv = (header: string[], rows: Array<Array<string | number | null | undefined>>) => {
  const cell = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return `﻿${[header.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\n')}`;
};

export const EXPORT_KINDS = ['trial-balance', 'day-book', 'party-balances', 'gst-sales', 'gst-purchases', 'tds', 'chart-of-accounts'] as const;

/** CSV text for a report; every export is written to the audit trail. */
export const exportCsv = async (kind: string, query: Record<string, unknown>, context: ActorContext) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? financialYearOf(to).startDate;
  let content = '';
  switch (kind) {
    case 'trial-balance': {
      const tb = await getTrialBalance({ from: dateOnly(from), to: dateOnly(to) });
      content = csv(['Code', 'Ledger', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'], tb.rows.map((row) => [row.code, row.name, row.openingDebit, row.openingCredit, row.periodDebit, row.periodCredit, row.closingDebit, row.closingCredit]));
      break;
    }
    case 'day-book': {
      const lines = await prisma.finVoucherLine.findMany({
        where: { voucher: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to } } },
        include: { voucher: { select: { number: true, type: true, date: true, narration: true, reference: true, status: true } }, account: { select: { code: true, name: true } }, party: { select: { code: true, name: true } } },
        orderBy: [{ voucher: { date: 'asc' } }, { voucher: { number: 'asc' } }, { lineNo: 'asc' }],
        take: 100000,
      });
      content = csv(['Date', 'Voucher', 'Type', 'Status', 'Ledger code', 'Ledger', 'Party', 'Debit', 'Credit', 'Narration', 'Reference'], lines.map((line) => [dateOnly(line.voucher.date), line.voucher.number, line.voucher.type, line.voucher.status, line.account.code, line.account.name, line.party?.name, line.debit.toNumber() || '', line.credit.toNumber() || '', line.narration ?? line.voucher.narration, line.voucher.reference]));
      break;
    }
    case 'party-balances': {
      const balances = await getPartyBalances({});
      const parties = await prisma.finParty.findMany({ where: { id: { in: Object.keys(balances) } }, select: { id: true, code: true, name: true, gstin: true, pan: true, mobile: true } });
      content = csv(['Code', 'Party', 'GSTIN', 'PAN', 'Mobile', 'Receivable', 'Payable', 'Advances', 'Net (Dr+)'], parties.map((party) => [party.code, party.name, party.gstin, party.pan, party.mobile, balances[party.id]!.receivable, balances[party.id]!.payable, balances[party.id]!.advances, balances[party.id]!.net]));
      break;
    }
    case 'gst-sales':
    case 'gst-purchases': {
      const rows = await gstRegister(kind === 'gst-sales' ? 'SALES' : 'PURCHASES', { from, to });
      content = csv(['Date', 'Voucher', 'Invoice', 'Type', 'Section', 'Party', 'GSTIN', 'POS', 'Taxable', 'IGST', 'CGST', 'SGST', 'Value', 'RCM', 'Ineligible ITC'], rows.map((row) => [row.date, row.number, row.invoiceNo, row.kind, row.section, row.partyName, row.gstin, row.placeOfSupply, row.taxable, row.igst, row.cgst, row.sgst, row.invoiceValue, row.reverseCharge ? 'Y' : 'N', row.ineligibleTax]));
      break;
    }
    case 'tds': {
      const register = await getWithholdingRegister({ kind: 'TDS', from: dateOnly(from), to: dateOnly(to) });
      content = csv(['Date', 'Voucher', 'Section', 'Party', 'PAN', 'Entry', 'Amount'], register.rows.map((row) => [row.date, row.voucherNumber, row.section, row.party?.name, row.party?.pan, row.movement, row.amount]));
      break;
    }
    case 'chart-of-accounts': {
      const accounts = await prisma.finAccount.findMany({ include: { group: { select: { code: true, name: true, nature: true } } }, orderBy: { code: 'asc' } });
      content = csv(['Code', 'Ledger', 'Group code', 'Group', 'Nature', 'Kind', 'System role', 'Active'], accounts.map((account) => [account.code, account.name, account.group.code, account.group.name, account.group.nature, account.kind, account.systemKey, account.isActive ? 'Y' : 'N']));
      break;
    }
    default:
      throw badRequest('Unknown export.');
  }
  await writeFinAudit({ ...context, entityType: 'FinExport', entityId: kind, action: 'EXPORT', after: { from: dateOnly(from), to: dateOnly(to), bytes: content.length } });
  return { fileName: `${kind}-${dateOnly(from)}-${dateOnly(to)}.csv`, content };
};

const TALLY_GROUP: Record<string, string> = {
  '1100': 'Fixed Assets', '1205': 'Stock-in-Hand', '1220': 'Sundry Debtors', '1230': 'Loans & Advances (Asset)', '1260': 'Duties & Taxes', '1290': 'Current Assets', '1300': 'Bank Accounts', '1400': 'Suspense A/c',
  '2110': 'Sundry Creditors', '2120': 'Current Liabilities', '2140': 'Duties & Taxes', '2160': 'Current Liabilities', '2170': 'Provisions', '2200': 'Loans (Liability)', '3000': 'Capital Account',
  '4100': 'Sales Accounts', '4500': 'Indirect Incomes', '5000': 'Direct Expenses', '6000': 'Indirect Expenses', '6100': 'Indirect Expenses', '6900': 'Indirect Expenses',
};
const TALLY_VOUCHER: Record<string, string> = { JOURNAL: 'Journal', ADJUSTMENT: 'Journal', OPENING: 'Journal', PAYMENT: 'Payment', RECEIPT: 'Receipt', CONTRA: 'Contra', SALES: 'Sales', PURCHASE: 'Purchase', CREDIT_NOTE: 'Credit Note', DEBIT_NOTE: 'Debit Note' };
const xml = (value: string | null | undefined) => (value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);

/**
 * Tally Prime import file: ledger masters (party lines become party ledgers under Sundry
 * Debtors / Creditors) followed by the period's posted vouchers.
 */
export const exportTally = async (query: Record<string, unknown>, context: ActorContext) => {
  const to = readDate(query, 'to', 'To') ?? istToday();
  const from = readDate(query, 'from', 'From') ?? financialYearOf(to).startDate;
  const [groups, accounts, vouchers] = await Promise.all([
    prisma.finAccountGroup.findMany({ select: { id: true, code: true, parentId: true } }),
    prisma.finAccount.findMany({ select: { id: true, code: true, name: true, groupId: true, kind: true, tallyName: true } }),
    prisma.finVoucher.findMany({
      where: { status: { in: LEDGER_STATUSES }, date: { gte: from, lte: to } },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { party: { select: { name: true } } } } },
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
      take: 20000,
    }),
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const tallyGroupOf = (groupId: string) => {
    let group = groupById.get(groupId);
    while (group) {
      if (TALLY_GROUP[group.code]) return TALLY_GROUP[group.code]!;
      group = group.parentId ? groupById.get(group.parentId) : undefined;
    }
    return 'Suspense A/c';
  };
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const ledgerName = (accountId: string, partyName: string | null) => {
    const account = accountById.get(accountId)!;
    if (partyName && account.kind === 'PARTY_CONTROL') return partyName;
    return account.tallyName || account.name;
  };
  const masters = new Map<string, string>();
  for (const account of accounts) masters.set(account.tallyName || account.name, account.kind === 'CASH' ? 'Cash-in-Hand' : tallyGroupOf(account.groupId));
  for (const voucher of vouchers) for (const line of voucher.lines) {
    const account = accountById.get(line.accountId)!;
    if (line.party && account.kind === 'PARTY_CONTROL') masters.set(line.party.name, tallyGroupOf(account.groupId));
  }
  const ledgerXml = Array.from(masters.entries()).map(([name, parent]) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(name)}" ACTION="Create"><NAME>${xml(name)}</NAME><PARENT>${xml(parent)}</PARENT></LEDGER></TALLYMESSAGE>`).join('\n');
  const voucherXml = vouchers.map((voucher) => {
    const type = TALLY_VOUCHER[voucher.type] ?? 'Journal';
    const entries = voucher.lines.map((line) => {
      const debit = line.debit.toNumber();
      const value = debit ? -debit : line.credit.toNumber();
      return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(ledgerName(line.accountId, line.party?.name ?? null))}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${value.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    }).join('');
    return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${voucher.date.toISOString().slice(0, 10).replace(/-/g, '')}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(voucher.number)}</VOUCHERNUMBER><REFERENCE>${xml(voucher.reference)}</REFERENCE><NARRATION>${xml(voucher.narration)}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE>`;
  }).join('\n');
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>\n${ledgerXml}\n</REQUESTDATA></IMPORTDATA><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>\n${voucherXml}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
  await writeFinAudit({ ...context, entityType: 'FinExport', entityId: 'tally', action: 'EXPORT', after: { from: dateOnly(from), to: dateOnly(to), vouchers: vouchers.length, ledgers: masters.size } });
  return { fileName: `tally-${dateOnly(from)}-${dateOnly(to)}.xml`, content, vouchers: vouchers.length, ledgers: masters.size };
};

/** Imports (workspace + Expenses-page statements) and exports, newest first. */
export const getUploadHistory = async () => {
  const [batches, statements, exports] = await Promise.all([
    prisma.finImportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.financeImportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.finAuditLog.findMany({ where: { entityType: 'FinExport' }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, entityId: true, createdAt: true, actorUserId: true, afterJson: true } }),
  ]);
  const userIds = Array.from(new Set([...batches.map((item) => item.createdById), ...statements.map((item) => item.createdByUserId), ...exports.map((item) => item.actorUserId)].filter((id): id is string => Boolean(id))));
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [];
  const name = (id: string | null) => (id ? users.find((user) => user.id === id)?.name ?? null : null);
  return {
    imports: [
      ...batches.map((item) => ({ id: item.id, kind: item.kind, source: 'WORKSPACE', fileName: item.fileName, dryRun: item.dryRun, totalRows: item.totalRows, created: item.created, failed: item.failed, errors: item.errors, at: item.createdAt, by: name(item.createdById) })),
      ...statements.map((item) => ({ id: item.id, kind: 'BANK_STATEMENT', source: 'EXPENSES_PAGE', fileName: item.fileName, dryRun: false, totalRows: item.totalRows, created: item.importedRows, failed: item.failedRows, errors: [], at: item.createdAt, by: name(item.createdByUserId) })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime()),
    exports: exports.map((item) => ({ id: item.id, kind: item.entityId, at: item.createdAt, by: name(item.actorUserId), details: item.afterJson })),
  };
};
