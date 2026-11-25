import { createHash } from 'node:crypto';
import prisma from '../../../lib/prisma';
import { uploadFileToDrive } from '../../../services/googleDrive.service';
import { getSecureDocumentUrl } from '../../../utils/secureDocumentUrl';
import { assertEmployeeAccess } from '../access';
import { writeHrmAudit } from '../audit';
import { HrmHttpError, HrmNotFoundError } from '../errors';
import { parseHrmInput, schemas } from '../validation';

type Actor = { userId: string; role: string; ipAddress?: string | null };

/** Files HR can upload to an employee (and that the browser can show). */
export const HRM_UPLOAD_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * HR uploads a real file for an employee (offer letter signed offline, education certificate, address proof, photo,
 * ...). It is stored privately and starts PENDING; somebody with hrm.documents.verify approves or rejects it.
 */
export const uploadEmployeeDocument = async (
  actor: Actor,
  employeeId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | undefined,
  rawInput: unknown,
) => {
  const input = parseHrmInput(schemas.uploadDocument, rawInput);
  await assertEmployeeAccess({ ...actor, employeeId });
  if (!file) throw new HrmHttpError(400, 'FILE_REQUIRED', 'Choose the file to upload (PDF, JPG, PNG or WEBP).');
  if (!HRM_UPLOAD_MIME_TYPES.has(file.mimetype)) throw new HrmHttpError(400, 'FILE_TYPE', 'Only PDF, JPG, PNG and WEBP files can be uploaded.');
  if (input.category === 'PHOTO' && file.mimetype === 'application/pdf') throw new HrmHttpError(400, 'FILE_TYPE', 'A photo must be a JPG, PNG or WEBP image.');

  const employee = await prisma.hrmEmployee.findUnique({ where: { id: employeeId }, select: { id: true, employeeCode: true, archivedAt: true } });
  if (!employee || employee.archivedAt) throw new HrmNotFoundError('Employee not found.');

  const sha256 = createHash('sha256').update(file.buffer).digest('hex');
  const safeTitle = input.title.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Document';
  const stored = await uploadFileToDrive(file.buffer, file.mimetype, `${employee.employeeCode}_${input.category}_${safeTitle}.${EXTENSION[file.mimetype]}`, undefined, { access: 'private' });

  const document = await prisma.hrmEmployeeDocument.create({
    data: {
      employeeId,
      category: input.category,
      title: input.title,
      fileRef: getSecureDocumentUrl(stored.fileId).slice(0, 500),
      driveFileId: stored.fileId,
      mimeType: file.mimetype,
      fileSize: file.size,
      // Written by the server itself: only such files are streamed back (see getDocumentFile).
      provider: 'GOOGLE_DRIVE',
      providerReference: `HRM_UPLOAD:${employeeId}`.slice(0, 200),
      status: 'PENDING',
      expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T00:00:00.000Z`) : null,
      uploadedById: actor.userId,
      metadata: { source: 'HRM_UPLOAD', sha256, originalName: file.originalname.slice(0, 200) },
    },
    select: {
      id: true, employeeId: true, category: true, title: true, mimeType: true, fileSize: true,
      provider: true, status: true, expiresAt: true, uploadedById: true, version: true, createdAt: true, updatedAt: true,
    },
  });
  await writeHrmAudit({
    actorUserId: actor.userId, entityType: 'HRM_DOCUMENT', entityId: document.id, action: 'UPLOADED',
    after: { ...document, sha256 }, ...(actor.ipAddress !== undefined ? { ipAddress: actor.ipAddress } : {}),
  });
  return document;
};
