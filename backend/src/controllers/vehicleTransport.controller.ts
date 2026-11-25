import { Request, Response, NextFunction } from 'express';
import {
  buildTransportDeliveryChallanPdf,
  getVehicleTransportById,
  getVehicleTransportList,
  updateTransportCarrier,
  updateTransportStatus,
} from '../services/vehicleTransport.service';
import { dispatchMarketplaceWhatsApp } from '../services/whatsappIntegration.service';
import prisma from '../lib/prisma';
import { VehicleTransportStatus } from '@prisma/client';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : 'An error occurred.');

const TRANSPORT_STATUS_LABEL: Record<VehicleTransportStatus, string> = {
  BOOKED: 'Pending Dispatch',
  VEHICLE_ASSIGNED: 'Pending Dispatch',
  DISPATCHED: 'On The Way',
  ON_THE_WAY: 'On The Way',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export type TransportNotifyOutcome = { sent: boolean; message: string };

const NOT_SENT_REASON: Record<string, string> = {
  INTEGRATION_DISABLED: 'WhatsApp integration is turned off.',
  AUTOMATION_DISABLED: 'The Vehicle Transport WhatsApp automation is disabled. Enable it under WhatsApp automations.',
  APPROVED_TEMPLATE_REQUIRED: 'No approved WhatsApp template is linked to this transport event.',
  RECIPIENT_PHONE_REQUIRED: 'The customer has no valid WhatsApp number.',
  NOTIFICATION_PREFERENCE_DISABLED: 'The customer has turned off WhatsApp notifications.',
  INVALID_TEMPLATE_CONFIGURATION: 'The linked WhatsApp template is not valid for this event.',
  AUTOMATION_CONFIGURATION_INVALID: 'The WhatsApp automation configuration is incomplete.',
  DISPATCH_ERROR: 'WhatsApp could not be queued because of a server error.',
};

/**
 * Sends the customer WhatsApp for a transport stage and reports what really happened,
 * so the screen never claims a message was sent when the automation skipped it.
 * It never throws and never blocks the status change.
 */
const notifyTransportWhatsApp = async (
  transportId: string,
  eventCode: 'VEHICLE_TRANSPORT_DISPATCHED' | 'VEHICLE_TRANSPORT_STATUS_UPDATE',
  options: { manual?: boolean } = {},
): Promise<TransportNotifyOutcome> => {
  try {
    const record = await getVehicleTransportById(transportId);
    if (!record) return { sent: false, message: 'Transport record was not found.' };

    const sell = record.sellAccount;
    const phone = sell.purchaserNumber;
    if (!phone) return { sent: false, message: NOT_SENT_REASON.RECIPIENT_PHONE_REQUIRED as string };

    const statusLabel = TRANSPORT_STATUS_LABEL[record.status] || record.status.replaceAll('_', ' ');
    // One message per status change: the change's own timeline entry makes the key unique,
    // so moving back and forth still notifies, while a repeated call for the same change does not.
    const latestEntryId = record.timeline[0]?.id ?? 'initial';
    const stageKey = options.manual ? `${record.status}-resend-${Date.now()}` : `${record.status}-${latestEntryId}`;

    const result = (await dispatchMarketplaceWhatsApp({
      eventCode,
      relatedEntityType: 'VEHICLE_TRANSPORT',
      relatedEntityId: transportId,
      recipientType: 'CUSTOMER',
      recipientPhone: phone,
      dedupeSuffix: `${transportId}-${stageKey}`,
      payloadSnapshot: {
        customerName: record.parties.delivery.name || sell.purchaserName || 'Customer',
        machineTitle: sell.listingTitle || [sell.brandName, sell.vehicleModel].filter(Boolean).join(' ') || 'Machine',
        vehicleNumber: sell.vehicleNumber || '-',
        challanNumber: record.challanNumber,
        transportStatus: statusLabel,
      },
    })) as { queued?: boolean; sent?: boolean; duplicate?: boolean; reason?: string; error?: string };

    if (result.duplicate) return { sent: false, message: 'This stage update was already sent to the customer.' };
    if (!result.queued) {
      return { sent: false, message: result.error || NOT_SENT_REASON[result.reason || ''] || 'WhatsApp was not sent.' };
    }
    if (!result.sent) return { sent: false, message: result.error || 'WhatsApp delivery failed. It can be retried from the WhatsApp message log.' };
    return { sent: true, message: 'WhatsApp update and challan sent to the customer.' };
  } catch (error) {
    console.error(`[VehicleTransport] WhatsApp notification failed for ${transportId}:`, error);
    return { sent: false, message: 'WhatsApp could not be sent because of a server error.' };
  }
};

/**
 * Downloads the Image-1 style Delivery Challan PDF.
 */
export const downloadDeliveryChallan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const challan = await buildTransportDeliveryChallanPdf(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${challan.fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(challan.buffer);
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
};

/**
 * Lists transport records with status filters and search.
 */
export const listVehicleTransports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const customer = typeof req.query.customer === 'string' ? req.query.customer.trim() : undefined;
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;

    const data = await getVehicleTransportList({
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      ...(customer ? { customer } : {}),
      page,
      limit,
    });
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

/**
 * Gets a single transport record details with timeline.
 */
export const getVehicleTransportDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const record = await getVehicleTransportById(id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Transport record not found.' });
    }
    res.json({ success: true, record });
  } catch (error) {
    next(error);
  }
};

/**
 * Updates carrier details (Truck No, Driver, Transporter, LR No).
 */
export const updateCarrierInfo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const actorId = req.user?.id;
    const {
      carrierVehicleNumber,
      transporterName,
      driverName,
      driverPhone,
      lrNumber,
      ewayBillNumber,
      challanNumber,
      challanDate,
      dispatchAddress,
      deliveryAddress,
      dispatchPincode,
      deliveryPincode,
      dispatchGstin,
      deliveryGstin,
    } = req.body;

    const updated = await updateTransportCarrier(
      id,
      {
        carrierVehicleNumber,
        transporterName,
        driverName,
        driverPhone,
        lrNumber,
        ewayBillNumber,
        challanNumber,
        challanDate,
        dispatchAddress,
        deliveryAddress,
        dispatchPincode,
        deliveryPincode,
        dispatchGstin,
        deliveryGstin,
      },
      actorId,
    );

    res.json({ success: true, record: updated, message: 'Carrier details updated successfully.' });
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
};

/**
 * Moves a shipment to its next stage (Pending Dispatch, Out For Delivery, On The Way, Delivered).
 * Optionally triggers a WhatsApp notification to the buyer.
 */
export const updateTransportStage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const actorId = req.user?.id;
    const actorName = req.user?.email || 'Staff';
    const { status, location, notes, sendWhatsApp } = req.body;

    if (!status || !Object.values(VehicleTransportStatus).includes(status as VehicleTransportStatus)) {
      return res.status(400).json({ success: false, error: 'Valid status is required.' });
    }

    const updated = await updateTransportStatus(
      id,
      {
        status: status as VehicleTransportStatus,
        location,
        notes,
      },
      actorId,
      actorName,
    );

    // The first move out of Pending Dispatch is the dispatch notice; every later stage is a status update.
    const notification: TransportNotifyOutcome | null = sendWhatsApp !== false
      ? await notifyTransportWhatsApp(id, status === 'OUT_FOR_DELIVERY' ? 'VEHICLE_TRANSPORT_DISPATCHED' : 'VEHICLE_TRANSPORT_STATUS_UPDATE')
      : null;

    res.json({
      success: true,
      record: updated,
      notification,
      message: `Status updated to ${TRANSPORT_STATUS_LABEL[status as VehicleTransportStatus] || (status as string).replaceAll('_', ' ')}.`,
    });
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
};

/**
 * Manually sends a WhatsApp notification for the current transport status.
 */
export const resendTransportWhatsApp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const record = await getVehicleTransportById(id);
    if (!record) return res.status(404).json({ success: false, error: 'Transport record not found.' });

    const eventCode = record.status === 'OUT_FOR_DELIVERY' ? 'VEHICLE_TRANSPORT_DISPATCHED' : 'VEHICLE_TRANSPORT_STATUS_UPDATE';
    const notification = await notifyTransportWhatsApp(record.id, eventCode, { manual: true });

    res.json({ success: notification.sent, notification, message: notification.message });
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
};

/**
 * Deletes a transport record (admin only).
 */
export const deleteVehicleTransport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.vehicleTransport.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Transport record not found.' });
    }

    await prisma.vehicleTransport.delete({ where: { id } });
    res.json({ success: true, message: 'Transport record deleted successfully.' });
  } catch (error) {
    res.status(400).json({ success: false, error: errorMessage(error) });
  }
};
