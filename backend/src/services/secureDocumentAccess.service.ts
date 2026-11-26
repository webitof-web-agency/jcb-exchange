import type { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { getSecureDocumentUrl } from '../utils/secureDocumentUrl';
import { assertDocumentAccess, getHrmPermissions } from '../modules/hrm/access';
import { HrmHttpError } from '../modules/hrm/errors';
import { hasHrmPermission, HRM_PERMISSIONS } from '../modules/hrm/security';
import { loadOperatorPermissions } from '../utils/permissionGrant';
import {
  applicationReachWhere,
  candidateReachWhere,
  offerReachWhere,
  OFFER_DOCUMENT_CATEGORIES,
} from '../utils/recruitmentReachRules';
import { getRecruitmentReach } from './recruitmentReach.service';

/**
 * Private files that belong to recruitment or HR records. Knowing a file's link is not enough: a staff member opens
 * one only with the permission the matching screen needs and, in recruitment, only for their own states.
 */

type Actor = { userId: string; role: string };

const recordFilters = (urls: readonly string[], driveFileId: string | null) => {
  // The same Drive file can be stored as the app's secure link or as a Drive link.
  const byDriveId = driveFileId && driveFileId.length >= 10 ? driveFileId : null;
  const candidate: Prisma.CandidateDocumentWhereInput = { OR: [{ fileUrl: { in: [...urls] } }, ...(byDriveId ? [{ fileUrl: { contains: byDriveId } }] : [])] };
  const offer: Prisma.OfferWhereInput = {
    OR: (['offerLetterUrl', 'signatureFileUrl', 'acceptanceCertificateUrl', 'signedLetterUrl'] as const).flatMap((field) => [
      { [field]: { in: [...urls] } },
      ...(byDriveId ? [{ [field]: { contains: byDriveId } }] : []),
    ]),
  };
  const hr: Prisma.HrmEmployeeDocumentWhereInput = { OR: [{ fileRef: { in: [...urls] } }, ...(byDriveId ? [{ driveFileId: byDriveId }, { fileRef: { contains: byDriveId } }] : [])] };
  return { candidate, offer, hr };
};

const findRecords = async (urls: readonly string[], driveFileId: string | null) => {
  const filters = recordFilters(urls, driveFileId);
  const [candidateDocuments, offers, hrDocuments] = await Promise.all([
    prisma.candidateDocument.findMany({ where: filters.candidate, select: { id: true, candidateId: true, applicationId: true, category: true }, take: 20 }),
    prisma.offer.findMany({ where: filters.offer, select: { id: true }, take: 20 }),
    prisma.hrmEmployeeDocument.findMany({ where: filters.hr, select: { id: true, employee: { select: { userId: true } } }, take: 20 }),
  ]);
  return { candidateDocuments, offers, hrDocuments };
};

/** True when the file is part of a recruitment or HR record (so it is not deleted through the generic file route). */
export const isRecruitmentOrHrFile = async (urls: readonly string[], driveFileId: string | null) => {
  const records = await findRecords(urls, driveFileId);
  return Boolean(records.candidateDocuments.length || records.offers.length || records.hrDocuments.length);
};

const publicChecks = new Map<string, { blocked: boolean; until: number }>();
const PUBLIC_CHECK_MS = 5 * 60 * 1000;
const PUBLIC_CHECK_LIMIT = 5000;

/**
 * The public media route (listing photos, blog images) serves any Drive file by its id. Resumes, offer letters and HR
 * documents are never public, so their ids are refused there too. Answers are remembered for a few minutes: that route
 * serves many images.
 */
export const isRecruitmentOrHrDriveFile = async (driveFileId: string) => {
  const now = Date.now();
  const known = publicChecks.get(driveFileId);
  if (known && known.until > now) return known.blocked;
  const urls = [
    getSecureDocumentUrl(driveFileId),
    `https://drive.google.com/uc?id=${encodeURIComponent(driveFileId)}`,
    `https://drive.google.com/file/d/${driveFileId}/view`,
  ];
  const [candidateDocument, offer, hrDocument] = await Promise.all([
    prisma.candidateDocument.findFirst({ where: { fileUrl: { in: urls } }, select: { id: true } }),
    prisma.offer.findFirst({ where: { OR: [{ offerLetterUrl: { in: urls } }, { signatureFileUrl: { in: urls } }, { acceptanceCertificateUrl: { in: urls } }, { signedLetterUrl: { in: urls } }] }, select: { id: true } }),
    prisma.hrmEmployeeDocument.findFirst({ where: { OR: [{ driveFileId }, { fileRef: { in: urls } }] }, select: { id: true } }),
  ]);
  const blocked = Boolean(candidateDocument || offer || hrDocument);
  if (publicChecks.size >= PUBLIC_CHECK_LIMIT) publicChecks.delete(publicChecks.keys().next().value!);
  publicChecks.set(driveFileId, { blocked, until: now + PUBLIC_CHECK_MS });
  return blocked;
};

/**
 * For a staff member opening a private file. UNRESTRICTED: not a recruitment / HR file (other modules keep their own
 * rules). Otherwise the file opens if any record it belongs to is open to them.
 */
export const checkStaffDocumentAccess = async (actor: Actor, urls: readonly string[], driveFileId: string | null): Promise<'ALLOWED' | 'DENIED' | 'UNRESTRICTED'> => {
  const { candidateDocuments, offers, hrDocuments } = await findRecords(urls, driveFileId);
  if (!candidateDocuments.length && !offers.length && !hrDocuments.length) return 'UNRESTRICTED';
  if (actor.role === 'SUPER_ADMIN') return 'ALLOWED';

  if (hrDocuments.length) {
    // Their own HR documents are theirs to read.
    if (hrDocuments.some((document) => document.employee.userId === actor.userId)) return 'ALLOWED';
    if (hasHrmPermission(await getHrmPermissions(actor.userId, actor.role), HRM_PERMISSIONS.DOCUMENTS_READ)) {
      for (const document of hrDocuments) {
        try {
          await assertDocumentAccess({ ...actor, documentId: document.id });
          return 'ALLOWED';
        } catch (error) {
          if (!(error instanceof HrmHttpError)) throw error;
        }
      }
    }
  }

  if (!offers.length && !candidateDocuments.length) return 'DENIED';
  const permissions = await loadOperatorPermissions(actor);
  const holds = (...needed: string[]) => permissions.has('ALL_ACCESS') || needed.some((permission) => permissions.has(permission));
  const reach = await getRecruitmentReach(actor);
  const offerFile = (category: string) => (OFFER_DOCUMENT_CATEGORIES as readonly string[]).includes(category);

  if (offers.length) {
    // A file of an offer shows its salary: the offer permission and the offer's place.
    if (!holds('recruitment.offers.read')) return 'DENIED';
    const visible = await prisma.offer.count({ where: { AND: [{ id: { in: offers.map((offer) => offer.id) } }, offerReachWhere(reach)] } });
    return visible ? 'ALLOWED' : 'DENIED';
  }

  for (const document of candidateDocuments) {
    if (offerFile(document.category) && !holds('recruitment.offers.read')) continue;
    // Somebody who takes an interview of this application may read what was sent with it.
    if (!offerFile(document.category) && document.applicationId && holds('recruitment.interviews.read', 'recruitment.interviews.scorecard')
      && await prisma.interview.count({ where: { applicationId: document.applicationId, interviewerId: actor.userId } })) return 'ALLOWED';
    if (!offerFile(document.category) && !holds('recruitment.applications.read', 'recruitment.candidates.read')) continue;
    const visible = document.applicationId
      ? await prisma.jobApplication.count({ where: { AND: [{ id: document.applicationId }, applicationReachWhere(reach)] } })
      : await prisma.candidate.count({ where: { AND: [{ id: document.candidateId }, candidateReachWhere(reach)] } });
    if (visible) return 'ALLOWED';
  }
  return 'DENIED';
};
