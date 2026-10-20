import { normalizeRtoWorkStatus } from './rtoStatus';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const serializeRtoRecord = (record: any, lockedByName?: string | null) => {
  const { sellAccount, listing, transferTasks, statusLogs, ...baseRecord } = record;
  void transferTasks;
  void statusLogs;
  const linkedBrandName = text(sellAccount?.brandName) || text(listing?.brand?.name);
  const linkedVehicleType = text(sellAccount?.vehicleType) || text(listing?.category?.name);
  const linkedVehicleModel = text(sellAccount?.vehicleModel) || text(listing?.model?.name);

  return {
    ...baseRecord,
    lockedByName: lockedByName || null,
    brandName: text(baseRecord.brandName) || linkedBrandName,
    vehicleType: text(baseRecord.vehicleType) || linkedVehicleType,
    vehicleModel: text(baseRecord.vehicleModel) || linkedVehicleModel,
    rtoStatus: normalizeRtoWorkStatus(record.rtoStatus),
    rtoExpenses: Number(baseRecord.rtoExpenses),
    rtoExpensesAdvance: Number(baseRecord.rtoExpensesAdvance),
    vehicleMaintenanceCost: Number(baseRecord.vehicleMaintenanceCost),
    rtoExpensesBalance: Math.max(0, Number(baseRecord.rtoExpenses) - Number(baseRecord.rtoExpensesAdvance)),
  };
};
