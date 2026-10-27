import { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';
import {
  addSellAccountPayment,
  cancelSellAccountReceipt,
  cancelSellAccountSale,
  createSellAccount,
  deleteSellAccount,
  deleteSellAccountPayment,
  getSellAccount,
  issueSellAccountReceipt,
  listSellAccounts,
  lockSellAccount,
  saveAndStartRtoWork,
  startRtoWork,
  updateSellAccount,
} from '../services/sellAccount.service';
import {
  approveSellAccountRefund,
  paySellAccountRefund,
  rejectSellAccountRefund,
  requestSellAccountRefund,
} from '../services/sellAccountRefund.service';
import { RecordLockedError } from '../services/recordLock';
import { RtoHandoffRequiredError } from '../services/linkedRecordDeletion';
import { completeVehicleSale, issueAndDeliverVehicleSaleInvoiceAfterFullPayment, resendVehicleSaleInvoice, VehicleSaleCompletionError } from '../services/vehicleSaleCompletion.service';
import {
  buildSellAccountCreditNotePdf,
  buildSellAccountRefundAdvicePdf,
  buildVehicleSaleInvoicePdf,
  buildVehicleSalePaymentReceiptPdf,
} from '../services/vehicleSaleInvoice.service';
import {
  deliverVehicleSalePaymentReceipt,
  normalizeVehicleSaleReceiptChannel,
  refreshVehicleSalePaymentReceiptToken,
  type VehicleSaleReceiptChannel,
} from '../services/vehicleSalePayment.service';
import { getPublicApiBaseUrl } from '../utils/publicApiUrl';

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Unable to process Sold Vehicle request.';
const errorStatus = (error: unknown) => {
  if (error instanceof RecordLockedError) return 423;
  if (error instanceof RtoHandoffRequiredError) return 409;
  return 400;
};

export const listSellAccountRecords = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json({ success: true, records: await listSellAccounts(req.query) }); } catch (error) { next(error); }
};

export const getSellAccountRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await getSellAccount(String(req.params.id));
    if (!record) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, record });
  } catch (error) { next(error); }
};

export const createSellAccountRecord = async (req: Request, res: Response, next: NextFunction) => {
  try { res.status(201).json({ success: true, record: await createSellAccount(req.body, req.user?.id) }); } catch (error) { res.status(400).json({ success: false, error: errorMessage(error) }); }
};

export const updateSellAccountRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await updateSellAccount(String(req.params.id), req.body, req.user?.id);
    if (!record) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, record });
  } catch (error) {
    const status = errorStatus(error);
    res.status(status).json({ success: false, error: errorMessage(error), ...(error instanceof RtoHandoffRequiredError ? { code: error.code } : {}) });
  }
};

export const startSellAccountRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await startRtoWork(String(req.params.id), req.user?.id);
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
};

export const saveAndStartSellAccountRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await saveAndStartRtoWork(undefined, req.body, req.user?.id);
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle could not be created.' });
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
};

export const updateAndStartSellAccountRtoRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await saveAndStartRtoWork(String(req.params.id), req.body, req.user?.id);
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
};

export const deleteSellAccountRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await deleteSellAccount(String(req.params.id), req.user?.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true });
  } catch (error) {
    res.status(errorStatus(error)).json({
      success: false,
      error: errorMessage(error),
      ...(error instanceof RtoHandoffRequiredError ? { code: error.code } : {}),
    });
  }
};

/** Customer payments are saved as draft receipts; nothing is sent until they are converted. */
export const addSellAccountPaymentRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await addSellAccountPayment(String(req.params.id), req.body, req.user?.id);
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.status(201).json({ success: true, record: result.record, paymentId: result.paymentId });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

/**
 * Draft → real money receipt. The receipt is sent to the customer (unless `send` is false) and,
 * when real receipts now cover the full amount, the Bill of Supply is issued and sent.
 */
export const issueSellAccountReceiptRecord = async (req: Request, res: Response) => {
  try {
    const result = await issueSellAccountReceipt(String(req.params.id), String(req.params.paymentId), req.user?.id);
    if (!result) return res.status(404).json({ success: false, error: 'Draft receipt not found.' });
    const delivery = req.body?.send === false
      ? null
      : await deliverVehicleSalePaymentReceipt(result.paymentId, result.receiptToken, getPublicApiBaseUrl(req));
    const finalDocument = result.record?.finance?.payments?.purchaserPaymentStatus === 'FULL'
      ? await issueAndDeliverVehicleSaleInvoiceAfterFullPayment(String(req.params.id), getPublicApiBaseUrl(req))
      : null;
    const record = finalDocument && !finalDocument.alreadyIssued ? await getSellAccount(String(req.params.id)) : result.record;
    res.json({ success: true, record, delivery, finalDocument });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const cancelSellAccountReceiptRecord = async (req: Request, res: Response) => {
  try {
    const record = await cancelSellAccountReceipt(String(req.params.id), String(req.params.paymentId), req.body || {}, req.user?.id);
    if (!record) return res.status(404).json({ success: false, error: 'Receipt not found.' });
    res.json({ success: true, record });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

const sendPdf = (res: Response, file: { buffer: Buffer; fileName: string }) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(file.buffer);
};

/** Staff download of a money receipt, drafts included (printed as "not valid"). */
export const downloadSellAccountPaymentReceipt = async (req: Request, res: Response) => {
  try {
    const payment = await prisma.sellAccountPayment.findFirst({ where: { id: String(req.params.paymentId), sellAccountId: String(req.params.id) }, select: { id: true } });
    if (!payment) return res.status(404).json({ success: false, error: 'Receipt not found.' });
    sendPdf(res, await buildVehicleSalePaymentReceiptPdf(payment.id, { allowDraft: true }));
  } catch (error) { res.status(400).json({ success: false, error: errorMessage(error) }); }
};

export const cancelSellAccountSaleRecord = async (req: Request, res: Response) => {
  try {
    const record = await cancelSellAccountSale(String(req.params.id), req.body || {}, req.user?.id);
    if (!record) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, record });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const downloadSellAccountCreditNote = async (req: Request, res: Response) => {
  try { sendPdf(res, await buildSellAccountCreditNotePdf(String(req.params.id))); }
  catch (error) { res.status(400).json({ success: false, error: errorMessage(error) }); }
};

const refundResponse = (res: Response, record: unknown, status = 200) => {
  if (!record) return res.status(404).json({ success: false, error: 'Refund not found.' });
  return res.status(status).json({ success: true, record });
};

export const requestSellAccountRefundRecord = async (req: Request, res: Response) => {
  try { refundResponse(res, await requestSellAccountRefund(String(req.params.id), req.body || {}, req.user?.id), 201); }
  catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const approveSellAccountRefundRecord = async (req: Request, res: Response) => {
  try { refundResponse(res, await approveSellAccountRefund(String(req.params.id), String(req.params.refundId), { id: req.user?.id, role: req.user?.role })); }
  catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const rejectSellAccountRefundRecord = async (req: Request, res: Response) => {
  try { refundResponse(res, await rejectSellAccountRefund(String(req.params.id), String(req.params.refundId), req.body || {}, req.user?.id)); }
  catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const paySellAccountRefundRecord = async (req: Request, res: Response) => {
  try { refundResponse(res, await paySellAccountRefund(String(req.params.id), String(req.params.refundId), req.body || {}, req.user?.id)); }
  catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const downloadSellAccountRefundAdvice = async (req: Request, res: Response) => {
  try { sendPdf(res, await buildSellAccountRefundAdvicePdf(String(req.params.id), String(req.params.refundId))); }
  catch (error) { res.status(400).json({ success: false, error: errorMessage(error) }); }
};

export const deleteSellAccountPaymentRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deleted = await deleteSellAccountPayment(String(req.params.id), String(req.params.paymentId), req.user?.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Payment entry not found.' });
    res.json({ success: true });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const resendSellAccountPaymentReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedChannel = req.body?.channel;
    const channel = normalizeVehicleSaleReceiptChannel(requestedChannel) as VehicleSaleReceiptChannel;
    if (requestedChannel !== undefined && !['SMS', 'WHATSAPP'].includes(String(requestedChannel))) {
      return res.status(400).json({ success: false, error: 'Receipt channel must be SMS or WHATSAPP.' });
    }
    const refreshed = await refreshVehicleSalePaymentReceiptToken(String(req.params.paymentId));
    if (!refreshed) return res.status(404).json({ success: false, error: 'Customer payment receipt not found.' });
    const delivery = await deliverVehicleSalePaymentReceipt(refreshed.paymentId, refreshed.token, getPublicApiBaseUrl(req), channel === 'BOTH' ? 'WHATSAPP' : channel, `resend-${Date.now()}`);
    res.json({ success: true, delivery });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
};

export const lockSellAccountRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await lockSellAccount(String(req.params.id), req.user?.id);
    if (!record) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, record });
  } catch (error) {
    res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
};

const completionErrorStatus = (error: unknown) => {
  if (error instanceof VehicleSaleCompletionError) return error.statusCode;
  return errorStatus(error);
};

export const completeSellAccountSale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await completeVehicleSale(String(req.params.id), req.body || {}, req.user?.id, getPublicApiBaseUrl(req));
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(completionErrorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
};

export const resendSellAccountInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resendVehicleSaleInvoice(String(req.params.id), getPublicApiBaseUrl(req));
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(completionErrorStatus(error)).json({ success: false, error: errorMessage(error) });
  }
};

export const downloadSellAccountInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invoice = await buildVehicleSaleInvoicePdf(String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(invoice.buffer);
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
};
