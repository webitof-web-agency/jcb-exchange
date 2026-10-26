import { NextFunction, Request, Response } from 'express';
import {
  addSellAccountPayment,
  createSellAccount,
  deleteSellAccount,
  deleteSellAccountPayment,
  getSellAccount,
  listSellAccounts,
  lockSellAccount,
  saveAndStartRtoWork,
  startRtoWork,
  updateSellAccount,
} from '../services/sellAccount.service';
import { RecordLockedError } from '../services/recordLock';
import { RtoHandoffRequiredError } from '../services/linkedRecordDeletion';
import { completeVehicleSale, issueAndDeliverVehicleSaleInvoiceAfterFullPayment, resendVehicleSaleInvoice, VehicleSaleCompletionError } from '../services/vehicleSaleCompletion.service';
import { buildVehicleSaleInvoicePdf } from '../services/vehicleSaleInvoice.service';
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

export const addSellAccountPaymentRecord = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await addSellAccountPayment(String(req.params.id), req.body, req.user?.id);
    if (!result) return res.status(404).json({ success: false, error: 'Sold Vehicle not found.' });
    const delivery = result.receiptToken
      ? await deliverVehicleSalePaymentReceipt(result.paymentId, result.receiptToken, getPublicApiBaseUrl(req))
      : null;
    const finalDocument = result.record.finance?.payments?.purchaserPaymentStatus === 'FULL'
      ? await issueAndDeliverVehicleSaleInvoiceAfterFullPayment(String(req.params.id), getPublicApiBaseUrl(req))
      : null;
    res.status(201).json({ success: true, record: result.record, delivery, finalDocument });
  } catch (error) { res.status(errorStatus(error)).json({ success: false, error: errorMessage(error) }); }
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
