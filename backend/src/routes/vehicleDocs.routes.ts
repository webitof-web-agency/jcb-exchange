import { NextFunction, Request, Response, Router } from 'express';
import { requireAdminOrEmployeePermissions, requireAuth } from '../middlewares/auth.middleware';
import { writeFinAudit } from '../modules/finance-hub/services/audit.service';
import {
  assertZipHasFiles,
  buildVehicleDetailsPdf,
  getVehicleDocs,
  listVehicleDocs,
  parseDocSection,
  readVehicleDoc,
  VehicleDocsError,
  vehicleZipFileName,
  writeVehicleDocsZip,
} from '../services/vehicleDocs.service';

// Vehicle Docs (Accounts → Vehicle Docs): same access as Sold Vehicles because the files include
// Aadhaar / PAN copies. Every download is written to the finance audit trail.
const router = Router();
router.use(requireAuth, requireAdminOrEmployeePermissions(['accounts.sell.read', 'accounts.sell.crud']));

const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (error instanceof VehicleDocsError) {
      if (!res.headersSent) res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }
};

const audit = (req: Request, action: string, entityId: string, after?: Record<string, unknown>) =>
  writeFinAudit({
    actorUserId: req.user?.id ?? null,
    ipAddress: req.ip ?? null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300) || null,
    entityType: 'VehicleDocs',
    entityId,
    action,
    after,
  }).catch(() => undefined);

const contentDisposition = (fileName: string, inline: boolean) =>
  `${inline ? 'inline' : 'attachment'}; filename="${fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;

const sendFile = (res: Response, file: { buffer: Buffer; fileName: string; mimeType: string }, inline: boolean) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', contentDisposition(file.fileName, inline));
  res.send(file.buffer);
};

router.get('/', handle(async (req, res) => {
  res.json({ vehicles: await listVehicleDocs({ q: req.query.q }) });
}));

router.get('/:number', handle(async (req, res) => {
  res.json(await getVehicleDocs(String(req.params.number)));
}));

router.get('/:number/details.pdf', handle(async (req, res) => {
  const inline = req.query.inline === '1';
  const file = await buildVehicleDetailsPdf(String(req.params.number));
  if (!inline) await audit(req, 'DOWNLOAD_DETAILS_PDF', String(req.params.number));
  sendFile(res, { ...file, mimeType: 'application/pdf' }, inline);
}));

router.get('/:number/files/:docId', handle(async (req, res) => {
  const inline = req.query.inline === '1';
  const file = await readVehicleDoc(String(req.params.number), String(req.params.docId));
  await audit(req, inline ? 'PREVIEW_FILE' : 'DOWNLOAD_FILE', String(req.params.number), { docId: req.params.docId, fileName: file.fileName });
  sendFile(res, file, inline);
}));

// ?section=Buyer%20%26%20Sale zips one section only.
router.get('/:number/zip', handle(async (req, res) => {
  const number = String(req.params.number);
  const section = parseDocSection(req.query.section);
  // Check first so an unknown vehicle or an empty section returns a JSON error before the ZIP headers are sent.
  await assertZipHasFiles(number, section);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition(vehicleZipFileName(number, section), false));
  const result = await writeVehicleDocsZip(number, res, section);
  await audit(req, 'DOWNLOAD_ZIP', number, result);
}));

export default router;
