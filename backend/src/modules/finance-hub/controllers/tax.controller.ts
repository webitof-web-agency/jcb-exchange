import type { NextFunction, Request, Response } from 'express';
import { getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import type { LedgerAccess } from '../services/ledger.service';
import { dateOnly } from '../utils/input';
import {
  bookTaxProvision,
  createChallan,
  get2bReconciliation,
  getGstRegister,
  getGstSummary,
  getIncomeTax,
  getTaxRange,
  getWithholdingRegister,
  gstRegister as gstRegisterRows,
  listChallans,
  listEInvoices,
  postGstSetOff,
  saveTaxDocRef,
  upload2b,
} from '../services/tax.service';

const query = (req: Request) => req.query as Record<string, unknown>;
const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/gu, '""')}"`;
const sendCsv = (res: Response, fileName: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^A-Za-z0-9._-]/gu, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(`\uFEFF${csv}`);
};
const ledgerAccess = async (req: Request): Promise<LedgerAccess> => {
  const permissions = await getRequestPermissions(req);
  return { actor: actorFromRequest(req), isSuperAdmin: req.user?.role === 'SUPER_ADMIN', canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]), canApprove: hasAnyOf(permissions, [P.approve]) };
};

export const gstRegister = handle((req) => getGstRegister(query(req)));
export const gstSummary = handle((req) => getGstSummary(query(req)));
export const gstSetOff = handle(async (req) => postGstSetOff(requestBody(req), await ledgerAccess(req)), 201);
export const gstr2bUpload = handle((req) => upload2b(requestBody(req), actorFromRequest(req)), 201);
export const gstr2bRecon = handle((req) => get2bReconciliation(query(req)));
export const withholding = handle((req) => getWithholdingRegister(query(req)));
export const challans = handle(async (req) => ({ challans: await listChallans(query(req)) }));
export const newChallan = handle(async (req) => createChallan(requestBody(req), await ledgerAccess(req)), 201);
export const eInvoices = handle(async (req) => ({ invoices: await listEInvoices(query(req)) }));
export const saveEInvoice = handle((req) => saveTaxDocRef(requestBody(req), actorFromRequest(req)));
export const incomeTax = handle((req) => getIncomeTax(query(req)));
export const newProvision = handle(async (req) => bookTaxProvision(requestBody(req), await ledgerAccess(req)), 201);

export const exportCsv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const kind = String(req.params.kind ?? '').trim().toLowerCase();
    const args = query(req);
    const range = getTaxRange(args);
    if (kind === 'gst-sales' || kind === 'gst-purchases') {
      const side = kind === 'gst-purchases' ? 'PURCHASES' : 'SALES';
      const rows = await gstRegisterRows(side, range);
      return sendCsv(res, `${kind}-${dateOnly(range.from)}-${dateOnly(range.to)}.csv`, ['Date', 'Voucher', 'Invoice', 'Type', 'Section', 'Party', 'GSTIN', 'POS', 'Taxable', 'IGST', 'CGST', 'SGST', 'Invoice Value', 'RCM', 'Ineligible ITC'], rows.map((row) => [row.date, row.number, row.invoiceNo, row.kind, row.section, row.partyName, row.gstin, row.placeOfSupply, row.taxable, row.igst, row.cgst, row.sgst, row.invoiceValue, row.reverseCharge ? 'Y' : 'N', row.ineligibleTax]));
    }
    if (kind === 'gst-summary' || kind === 'gst-returns' || kind === 'itc') {
      const summary = await getGstSummary(args);
      const reconciliation = kind === 'gst-summary' ? null : await get2bReconciliation(args);
      const rows: unknown[][] = [
        ['Month', summary.month],
        ['Output taxable', summary.gstr3b.outwardTaxable.taxable],
        ['Output tax', summary.gstr3b.outwardTaxable.igst + summary.gstr3b.outwardTaxable.cgst + summary.gstr3b.outwardTaxable.sgst],
        ['Input tax', summary.gstr3b.itc.net.igst + summary.gstr3b.itc.net.cgst + summary.gstr3b.itc.net.sgst],
        ['Ineligible ITC', summary.gstr3b.itc.ineligible],
        ['Ledger output difference', summary.ledger.outputDifference.igst + summary.ledger.outputDifference.cgst + summary.ledger.outputDifference.sgst],
        ['Ledger input difference', summary.ledger.inputDifference.igst + summary.ledger.inputDifference.cgst + summary.ledger.inputDifference.sgst],
      ];
      if (reconciliation) rows.push(['2B matched', reconciliation.summary.matched], ['2B mismatch', reconciliation.summary.mismatch], ['Only in 2B', reconciliation.summary.onlyIn2b], ['Only in books', reconciliation.summary.onlyInBooks]);
      return sendCsv(res, `${kind}-${summary.month}.csv`, ['Metric', 'Value'], rows);
    }
    if (kind === 'e-invoices') {
      const invoices = await listEInvoices(args);
      return sendCsv(res, `e-invoices-${dateKey(args)}.csv`, ['Date', 'Invoice', 'Party', 'GSTIN', 'IRN', 'E-Way Bill', 'Status', 'Expected'], invoices.map((row) => [row.date, row.invoiceNo, row.partyName, row.gstin, row.ref?.irn, row.ref?.ewbNo, row.ref?.status, row.eInvoiceExpected ? 'Y' : 'N']));
    }
    if (kind === 'tds' || kind === 'tcs') {
      const register = await getWithholdingRegister({ ...args, kind: kind.toUpperCase(), side: 'PAYABLE' });
      return sendCsv(res, `${kind}-${register.from}-${register.to}.csv`, ['Date', 'Voucher', 'Section', 'Party', 'PAN', 'Movement', 'Amount'], register.rows.map((row) => [row.date, row.voucherNumber, row.section, row.party?.name, row.party?.pan, row.movement, row.amount]));
    }
    if (kind === 'challans') {
      const challans = await listChallans(args);
      return sendCsv(res, `tax-challans-${dateKey(args)}.csv`, ['Date', 'Tax Type', 'Period', 'Challan No', 'BSR Code', 'Total', 'Voucher', 'Proof'], challans.map((row) => [row.date, row.taxType, row.period, row.challanNo, row.bsrCode, row.total, row.voucher?.number, row.proofUrl ? 'AVAILABLE' : 'MISSING']));
    }
    if (kind === 'income-tax') {
      const report = await getIncomeTax(args);
      return sendCsv(res, `income-tax-${report.fy.start}-${report.fy.end}.csv`, ['Metric', 'Value'], [['Provision', report.provision], ['Advance Tax', report.advanceTax], ['TDS Receivable', report.tdsReceivable], ['Expense This Year', report.expenseThisYear], ['Provision Entries', report.provisions.length], ['Income Tax Challans', report.challans.length]]);
    }
    throw new Error('Unknown tax export.');
  } catch (error) {
    return handle(async () => { throw error; })(req, res, next);
  }
};

const dateKey = (args: Record<string, unknown>) => typeof args.month === 'string' ? args.month : typeof args.to === 'string' ? args.to : new Date().toISOString().slice(0, 10);
