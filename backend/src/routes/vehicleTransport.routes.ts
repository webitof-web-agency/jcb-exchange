import { Router } from 'express';
import { requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import {
  deleteVehicleTransport,
  downloadDeliveryChallan,
  getVehicleTransportDetail,
  listVehicleTransports,
  resendTransportWhatsApp,
  updateCarrierInfo,
  updateTransportStage,
} from '../controllers/vehicleTransport.controller';

const router = Router();
router.use(requireAuth);

const canViewTransport = requireAdminOrEmployeePermissions(['accounts.transport.read', 'accounts.transport.crud']);
const canManageTransport = requireAdminOrEmployeePermissions(['accounts.transport.crud', 'accounts.transport.update', 'accounts.transport.create']);
const canDeleteTransport = requireAdminOrEmployeePermissions(['accounts.transport.crud', 'accounts.transport.delete']);

// Read endpoints
router.get('/', canViewTransport, listVehicleTransports);
router.get('/:id', canViewTransport, getVehicleTransportDetail);
router.get('/:id/challan', canViewTransport, downloadDeliveryChallan);

// Manage / Update endpoints
router.patch('/:id/carrier', canManageTransport, updateCarrierInfo);
router.post('/:id/status', canManageTransport, updateTransportStage);
router.post('/:id/notify', canManageTransport, resendTransportWhatsApp);
router.delete('/:id', canDeleteTransport, deleteVehicleTransport);

export default router;
