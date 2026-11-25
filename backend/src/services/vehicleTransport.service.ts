import { renderTransportDeliveryChallanPdf } from '../utils/transportDeliveryChallanPdf';
import { Prisma, VehicleTransportStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { resolveTransportParties } from '../utils/transportParties';
import { validateTransportTransition } from '../utils/transportStages';

type DbClient = Prisma.TransactionClient | typeof prisma;

const TRANSPORT_STATUS_LABEL: Record<VehicleTransportStatus, string> = {
  BOOKED: 'Pending Dispatch',
  VEHICLE_ASSIGNED: 'Pending Dispatch',
  DISPATCHED: 'On The Way',
  ON_THE_WAY: 'On The Way',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/**
 * Generates the next clean sequential Challan number (e.g. "01", "02", "03", etc.)
 * matching the exact format in the user's statutory delivery challan image.
 */
export const generateNextChallanNumber = async (db: DbClient = prisma): Promise<string> => {
  const existing = await db.vehicleTransport.findMany({
    select: { challanNumber: true },
  });

  const numericNumbers = existing
    .map((item) => parseInt(item.challanNumber.trim(), 10))
    .filter((num) => !Number.isNaN(num) && num > 0);

  const maxNum = numericNumbers.length > 0 ? Math.max(...numericNumbers) : 0;
  const nextNum = maxNum + 1;
  return nextNum.toString().padStart(2, '0');
};

export type EnsureTransportInput = {
  id: string;
  recordNumber?: string | null;
  listingId?: string | null;
  listingTitle?: string | null;
  vehicleNumber?: string | null;
  brandName?: string | null;
  vehicleModel?: string | null;
  sellerName?: string | null;
  ownerName?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  purchaserName?: string | null;
  purchaserNumber?: string | null;
  purchaserCity?: string | null;
  purchaserState?: string | null;
  sellAmount: Prisma.Decimal | number;
  dealStatus?: string;
  isLocked?: boolean;
};

/**
 * Automatically creates or updates the VehicleTransport record when a Sold Vehicle is closed/completed.
 * Pre-populates all machine, seller, and buyer information.
 */
export const ensureVehicleTransportRecord = async (
  db: DbClient,
  sellAccount: EnsureTransportInput,
  actorId?: string | null,
) => {
  const existing = await db.vehicleTransport.findUnique({
    where: { sellAccountId: sellAccount.id },
    include: { timeline: { orderBy: { createdAt: 'desc' } } },
  });

  if (existing) {
    return existing;
  }

  const challanNumber = await generateNextChallanNumber(db);

  const dispatchCity = sellAccount.sellerCity?.trim() || '';
  const dispatchState = sellAccount.sellerState?.trim() || '';
  const dispatchName = sellAccount.sellerName?.trim() || sellAccount.ownerName?.trim() || '';

  const deliveryCity = sellAccount.purchaserCity?.trim() || '';
  const deliveryState = sellAccount.purchaserState?.trim() || '';
  const deliveryName = sellAccount.purchaserName?.trim() || '';

  const created = await db.vehicleTransport.create({
    data: {
      sellAccountId: sellAccount.id,
      challanNumber,
      challanDate: new Date(),
      declaredValue: new Prisma.Decimal(sellAccount.sellAmount || 0),
      dispatchName,
      dispatchGstin: 'URP',
      dispatchCity,
      dispatchState,
      deliveryName,
      deliveryGstin: 'URP',
      deliveryCity,
      deliveryState,
      customerPhone: sellAccount.purchaserNumber?.trim() || '',
      status: VehicleTransportStatus.BOOKED,
      currentLocation: dispatchCity,
      lastRemark: 'Vehicle deal completed. Queued for carrier assignment.',
      createdById: actorId || null,
      timeline: {
        create: {
          status: VehicleTransportStatus.BOOKED,
          location: dispatchCity,
          notes: 'Transport record auto-initialized from Sold Vehicle deal.',
          actorId: actorId || null,
        },
      },
    },
    include: {
      timeline: true,
      sellAccount: true,
    },
  });

  return created;
};

/**
 * Backfills any existing completed Sold Vehicles into the Transport & Delivery module.
 */
export const backfillExistingSoldVehiclesTransport = async (db: DbClient = prisma) => {
  const soldVehicles = await db.sellAccount.findMany({
    where: {
      deletedAt: null,
      OR: [
        { dealStatus: 'DEAL_DONE' },
        { isLocked: true },
        { completedAt: { not: null } },
      ],
      transport: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  const createdRecords = [];
  for (const account of soldVehicles) {
    const transport = await ensureVehicleTransportRecord(db, account);
    createdRecords.push(transport);
  }

  return {
    totalBackfilled: createdRecords.length,
    records: createdRecords.map((r) => ({ id: r.id, sellAccountId: r.sellAccountId, challanNumber: r.challanNumber })),
  };
};

/**
 * Retrieves the paginated list of Transport & Delivery records with metrics and search filters.
 */
export const getVehicleTransportList = async ({
  status,
  search,
  customer,
  page = 1,
  limit = 25,
  db = prisma,
}: {
  status?: string;
  search?: string;
  customer?: string;
  page?: number;
  limit?: number;
  db?: DbClient;
} = {}) => {
  // Ensure all existing completed sold vehicles have their transport record initialized.
  if (page === 1) {
    try {
      await backfillExistingSoldVehiclesTransport(db);
    } catch (e) {
      console.warn('Transport backfill check skipped:', e);
    }
  }

  const where: Prisma.VehicleTransportWhereInput = {};

  if (status && status !== 'ALL') {
    if (status === 'BOOKED') {
      where.status = { in: [VehicleTransportStatus.BOOKED, VehicleTransportStatus.VEHICLE_ASSIGNED] };
    } else if (status === 'ON_THE_WAY') {
      where.status = { in: [VehicleTransportStatus.ON_THE_WAY, VehicleTransportStatus.DISPATCHED] };
    } else if (Object.values(VehicleTransportStatus).includes(status as VehicleTransportStatus)) {
      where.status = status as VehicleTransportStatus;
    }
  }

  if (customer && customer.trim()) {
    where.sellAccount = { purchaserName: { equals: customer.trim(), mode: 'insensitive' } };
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { challanNumber: { contains: q, mode: 'insensitive' } },
      { carrierVehicleNumber: { contains: q, mode: 'insensitive' } },
      { driverName: { contains: q, mode: 'insensitive' } },
      { driverPhone: { contains: q, mode: 'insensitive' } },
      { deliveryName: { contains: q, mode: 'insensitive' } },
      { customerPhone: { contains: q, mode: 'insensitive' } },
      { dispatchName: { contains: q, mode: 'insensitive' } },
      {
        sellAccount: {
          OR: [
            { vehicleNumber: { contains: q, mode: 'insensitive' } },
            { listingTitle: { contains: q, mode: 'insensitive' } },
            { recordNumber: { contains: q, mode: 'insensitive' } },
            { purchaserName: { contains: q, mode: 'insensitive' } },
            { sellerName: { contains: q, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  // Same filters without the stage, so each stage tab can show how many shipments match the search / customer.
  const scopeWhere: Prisma.VehicleTransportWhereInput = { ...where };
  delete scopeWhere.status;
  const hasScopeFilter = Object.keys(scopeWhere).length > 0;

  const [total, items, counts, customerRows, scopedCounts] = await Promise.all([
    db.vehicleTransport.count({ where }),
    db.vehicleTransport.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        sellAccount: {
          select: {
            id: true,
            recordNumber: true,
            vehicleNumber: true,
            listingTitle: true,
            brandName: true,
            vehicleModel: true,
            sellerName: true,
            sellerNumber: true,
            sellerCity: true,
            sellerState: true,
            purchaserName: true,
            purchaserNumber: true,
            purchaserCity: true,
            purchaserState: true,
            listingId: true,
            listing: {
              select: {
                id: true,
                title: true,
                media: { select: { url: true, isFeatured: true } },
manufacturingYear: true,
              },
            },
          },
        },
        timeline: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    db.vehicleTransport.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    db.sellAccount.findMany({
      where: { transport: { isNot: null }, purchaserName: { not: null } },
      select: { purchaserName: true },
      distinct: ['purchaserName'],
      orderBy: { purchaserName: 'asc' },
    }),
    hasScopeFilter
      ? db.vehicleTransport.groupBy({ by: ['status'], where: scopeWhere, _count: { _all: true } })
      : Promise.resolve(null),
  ]);

  const customers = customerRows
    .map((row) => row.purchaserName?.trim() || '')
    .filter((name, index, all) => name && all.indexOf(name) === index);

  const summarize = (groups: Array<{ status: VehicleTransportStatus; _count: { _all: number } }>) => {
    const summary = { total: 0, pendingDispatch: 0, onTheWay: 0, outForDelivery: 0, delivered: 0 };
    for (const c of groups) {
      const count = c._count._all;
      summary.total += count;
      if (c.status === VehicleTransportStatus.BOOKED || c.status === VehicleTransportStatus.VEHICLE_ASSIGNED) {
        summary.pendingDispatch += count;
      } else if (c.status === VehicleTransportStatus.ON_THE_WAY || c.status === VehicleTransportStatus.DISPATCHED) {
        summary.onTheWay += count;
      } else if (c.status === VehicleTransportStatus.OUT_FOR_DELIVERY) {
        summary.outForDelivery += count;
      } else if (c.status === VehicleTransportStatus.DELIVERED) {
        summary.delivered += count;
      }
    }
    return summary;
  };

  // metrics: every shipment (KPI cards). tabCounts: shipments matching the search / customer filter (stage tabs).
  const metrics = summarize(counts);
  const tabCounts = scopedCounts ? summarize(scopedCounts) : metrics;

  return {
    tabCounts,
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    metrics,
    customers,
  };
};

/**
 * Retrieves a single transport record with its full timeline and linked sold vehicle.
 */
const loadVehicleTransportRecord = async (id: string, db: DbClient = prisma) => {
  let record = await db.vehicleTransport.findFirst({
    where: {
      OR: [
        { id },
        { challanNumber: id },
        { sellAccountId: id },
      ],
    },
    include: {
      sellAccount: {
        include: {
          listing: {
            select: {
              id: true,
              title: true,
              media: { select: { url: true, isFeatured: true } },
              manufacturingYear: true,
              engineNumber: true,
            },
          },
        },
      },
      timeline: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // If not found by transport ID, check if this was a completed sold vehicle ID and auto-initialize it.
  if (!record) {
    const sellAccount = await db.sellAccount.findFirst({
      where: {
        OR: [{ id }, { recordNumber: id }],
        deletedAt: null,
      },
    });
    if (sellAccount && (sellAccount.dealStatus === 'DEAL_DONE' || sellAccount.isLocked || sellAccount.completedAt)) {
      await ensureVehicleTransportRecord(db, sellAccount);
      record = await db.vehicleTransport.findFirst({
        where: { sellAccountId: sellAccount.id },
        include: {
          sellAccount: {
            include: {
              listing: {
                select: {
                  id: true,
                  title: true,
                  media: { select: { url: true, isFeatured: true } },
                  manufacturingYear: true,
                  engineNumber: true,
                },
              },
            },
          },
          timeline: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });
    }
  }

  return record;
};

/**
 * Retrieves a single transport record plus the resolved consignor / consignee block (parties).
 */
export const getVehicleTransportById = async (id: string, db: DbClient = prisma) => {
  const record = await loadVehicleTransportRecord(id, db);
  if (!record) return record;
  return { ...record, parties: resolveTransportParties(record, record.sellAccount) };
};

/**
 * Updates carrier details (Truck No, Driver details, Transporter, LR No).
 */
export const updateTransportCarrier = async (
  id: string,
  input: {
    carrierVehicleNumber?: string | null;
    transporterName?: string | null;
    driverName?: string | null;
    driverPhone?: string | null;
    lrNumber?: string | null;
    ewayBillNumber?: string | null;
    challanNumber?: string | null;
    challanDate?: Date | string | null;
    dispatchAddress?: string | null;
    deliveryAddress?: string | null;
    dispatchPincode?: string | null;
    deliveryPincode?: string | null;
    dispatchGstin?: string | null;
    deliveryGstin?: string | null;
  },
  actorId?: string,
) => {
  const current = await prisma.vehicleTransport.findUnique({ where: { id } });
  if (!current) throw new Error('Transport record not found.');

  const nextStatus = (current.status === VehicleTransportStatus.BOOKED && input.carrierVehicleNumber?.trim())
    ? VehicleTransportStatus.VEHICLE_ASSIGNED
    : current.status;

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.vehicleTransport.update({
      where: { id },
      data: {
        ...(input.carrierVehicleNumber !== undefined ? { carrierVehicleNumber: input.carrierVehicleNumber?.trim().toUpperCase() || null } : {}),
        ...(input.transporterName !== undefined ? { transporterName: input.transporterName?.trim() || null } : {}),
        ...(input.driverName !== undefined ? { driverName: input.driverName?.trim() || null } : {}),
        ...(input.driverPhone !== undefined ? { driverPhone: input.driverPhone?.trim() || null } : {}),
        ...(input.lrNumber !== undefined ? { lrNumber: input.lrNumber?.trim() || null } : {}),
        ...(input.ewayBillNumber !== undefined ? { ewayBillNumber: input.ewayBillNumber?.trim() || null } : {}),
        ...(input.challanNumber !== undefined && input.challanNumber?.trim() ? { challanNumber: input.challanNumber.trim() } : {}),
        ...(input.challanDate ? { challanDate: new Date(input.challanDate) } : {}),
        ...(input.dispatchAddress !== undefined ? { dispatchAddress: input.dispatchAddress?.trim() || '' } : {}),
        ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress?.trim() || '' } : {}),
        ...(input.dispatchPincode !== undefined ? { dispatchPincode: input.dispatchPincode?.trim() || null } : {}),
        ...(input.deliveryPincode !== undefined ? { deliveryPincode: input.deliveryPincode?.trim() || null } : {}),
        ...(input.dispatchGstin !== undefined ? { dispatchGstin: input.dispatchGstin?.trim().toUpperCase() || 'URP' } : {}),
        ...(input.deliveryGstin !== undefined ? { deliveryGstin: input.deliveryGstin?.trim().toUpperCase() || 'URP' } : {}),
        status: nextStatus,
        updatedById: actorId || null,
      },
    });

    if (nextStatus !== current.status) {
      await tx.vehicleTransportTimeline.create({
        data: {
          transportId: id,
          status: nextStatus,
          location: current.currentLocation,
          notes: `Carrier assigned: ${input.carrierVehicleNumber || 'Truck'}${input.driverName ? ` (Driver: ${input.driverName})` : ''}`,
          actorId: actorId || null,
        },
      });
    }

    return record;
  });

  return getVehicleTransportById(updated.id);
};

/**
 * Updates transport status with an Amazon-style progress checkpoint.
 */
export const updateTransportStatus = async (
  id: string,
  input: {
    status: VehicleTransportStatus;
    location?: string | null;
    notes?: string | null;
  },
  actorId?: string,
  actorName?: string,
) => {
  const current = await prisma.vehicleTransport.findUnique({ where: { id } });
  if (!current) throw new Error('Transport record not found.');

  const transitionError = validateTransportTransition(current.status, input.status);
  if (transitionError) throw new Error(transitionError);

  const now = new Date();
  const location = input.location?.trim() || current.currentLocation;
  const notes = input.notes?.trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.vehicleTransport.update({
      where: { id },
      data: {
        status: input.status,
        currentLocation: location,
        lastRemark: notes || `Status changed to ${input.status.replaceAll('_', ' ')}`,
        ...((input.status === VehicleTransportStatus.DISPATCHED || input.status === VehicleTransportStatus.OUT_FOR_DELIVERY) && !current.dispatchedAt ? { dispatchedAt: now } : {}),
        ...(input.status === VehicleTransportStatus.DELIVERED && !current.deliveredAt ? { deliveredAt: now } : {}),
        updatedById: actorId || null,
      },
    });

    await tx.vehicleTransportTimeline.create({
      data: {
        transportId: id,
        status: input.status,
        location,
        notes,
        actorId: actorId || null,
        actorName: actorName || null,
      },
    });

    return record;
  });

  return getVehicleTransportById(updated.id);
};

const formatDdmmyyyy = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
};

/**
 * Builds the PDF buffer and safe file name for a transport delivery challan.
 */
export const buildTransportDeliveryChallanPdf = async (id: string, db: DbClient = prisma) => {
  const record = await getVehicleTransportById(id, db);
  if (!record) throw new Error('Transport record was not found for delivery challan generation.');

  const sell = record.sellAccount;
  const { dispatch, delivery, declaredValue } = record.parties;
  const machineTitle = sell.listingTitle || [sell.brandName, sell.vehicleModel].filter(Boolean).join(' ');

  const buffer = await renderTransportDeliveryChallanPdf({
    challanNumber: record.challanNumber,
    challanDate: formatDdmmyyyy(record.challanDate || record.createdAt),
    machineTitle,
    registrationNumber: sell.vehicleNumber,
    declaredValue,
    carrierVehicleNumber: record.carrierVehicleNumber,
    dispatchName: dispatch.name,
    dispatchGstin: dispatch.gstin,
    dispatchAddress: dispatch.address,
    dispatchCity: dispatch.city,
    dispatchState: dispatch.state,
    dispatchPincode: dispatch.pincode,
    deliveryName: delivery.name,
    deliveryGstin: delivery.gstin,
    deliveryAddress: delivery.address,
    deliveryCity: delivery.city,
    deliveryState: delivery.state,
    deliveryPincode: delivery.pincode,
    signatoryName: dispatch.name,
  });

  const safeNum = record.challanNumber.replace(/[^A-Za-z0-9-]+/g, '-');
  return {
    buffer,
    fileName: `Delivery-Challan-${safeNum}.pdf`,
    challanNumber: record.challanNumber,
  };
};
