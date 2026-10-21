import type { Request } from 'express';
import { badRequest, handle } from '../http';
import { getLedgerBalances, getReceiptsRegister, getVehicleDetail, getVehicleRegister } from '../services/vehicleFinance.service';

const query = (req: Request) => req.query as Record<string, unknown>;

export const vehicleRegister = handle((req) => getVehicleRegister(query(req)));
export const vehicleDetail = handle((req) => {
  const id = req.params.id;
  if (typeof id !== 'string' || !id || id.length > 60) throw badRequest('Vehicle id is required.');
  return getVehicleDetail(id, query(req));
});
export const ledgerBalances = handle((req) => getLedgerBalances(query(req)));
export const receiptsRegister = handle((req) => getReceiptsRegister(query(req)));
