import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { deleteFileFromDrive, extractDriveFileId, streamFileFromDrive, uploadFileToDrive } from './googleDrive.service';
import { getSecureDocumentUrl } from '../utils/secureDocumentUrl';
import {
  METHOD_LABELS,
  buildAcceptanceCertificatePdf,
  letterDay,
  sha256Hex,
  signedLetterStatement,
  type AcceptanceMethod,
} from '../utils/offerAcceptanceEvidence';
import { buildSignedOfferLetter } from '../utils/signedOfferLetter';

export { validateCandidateAcceptance } from '../utils/offerAcceptanceEvidence';

const MAX_OFFER_PDF_BYTES = 15 * 1024 * 1024;

/**
 * Accepting an offer, with evidence. The candidate signs on the offer link (typed name, drawn signature, or a scan of
 * the signed paper letter), or HR records a paper copy signed at the office. Every acceptance stores: who (the full
 * name typed), how (method), where (place), when, from which IP / browser, the signature or scan (private storage),
 * the SHA-256 of that file and of the offer letter PDF that was accepted, an acceptance certificate PDF, and the
 * signed offer letter (a typed or drawn signature is placed on the letter's signature line; a scan is the letter).
 *
 * These are simple electronic records of acceptance (like an email "I accept"), not Aadhaar eSign or a digital
 * signature certificate; the certificate says so.
 */

const readDriveFile = async (fileId: string, maxBytes: number) => {
  const stream = await streamFileFromDrive(fileId);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maxBytes) throw new Error('The offer letter file is too large to verify.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

export class OfferAcceptanceConflict extends Error {}

type OfferForAcceptance = Prisma.OfferGetPayload<{ include: { candidate: true; job: true; application: true } }>;

export type RecordAcceptanceInput = {
  offer: OfferForAcceptance;
  /** The link version the candidate used; HR (offline) passes null. */
  tokenVersion: number | null;
  method: AcceptanceMethod;
  acceptedName: string;
  place: string;
  ipAddress: string | null;
  userAgent: string | null;
  /** The drawn signature PNG, or the uploaded / offline scan. */
  file: { buffer: Buffer; mimeType: string; originalName: string } | null;
  /** The signature placed on the letter: the drawn one, or the typed name as the offer page showed it (PNG). */
  signatureImage?: Buffer | null;
  note?: string | null;
  acceptedById?: string | null;
  recordedByName?: string | null;
  acceptedAt?: Date;
};

const letterText = (offer: OfferForAcceptance, key: string) => {
  const data = offer.offerLetterData && typeof offer.offerLetterData === 'object' ? offer.offerLetterData as Record<string, unknown> : {};
  const value = data[key];
  return typeof value === 'string' ? value : '';
};

/**
 * Stores the evidence and marks the offer accepted. Files go to private storage first; if the offer was answered or
 * changed meanwhile, they are removed again and OfferAcceptanceConflict is thrown.
 */
export const recordOfferAcceptance = async (input: RecordAcceptanceInput) => {
  const { offer } = input;
  const letterFileId = extractDriveFileId(offer.offerLetterUrl);
  if (!letterFileId) throw new Error('The offer letter PDF is unavailable, so the acceptance cannot be recorded.');
  const letterBytes = await readDriveFile(letterFileId, MAX_OFFER_PDF_BYTES);
  const documentHash = sha256Hex(letterBytes);
  const acceptedAt = input.acceptedAt ?? new Date();
  const uploaded: string[] = [];
  const safeName = offer.candidate.fullName.replace(/[^a-z0-9]+/gi, '_');

  try {
    let signatureFileUrl: string | null = null;
    let signatureHash: string | null = null;
    let signedCopyDocument: { fileName: string; url: string; size: number; mimeType: string } | null = null;
    if (input.file) {
      signatureHash = sha256Hex(input.file.buffer);
      const extension = input.file.mimeType === 'application/pdf' ? 'pdf' : input.file.mimeType === 'image/png' ? 'png' : input.file.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const fileName = input.method === 'DRAWN'
        ? `Offer_Signature_${offer.application.applicationRef}_${safeName}.png`
        : `Offer_Letter_Signed_${offer.application.applicationRef}_${safeName}.${extension}`;
      const stored = await uploadFileToDrive(input.file.buffer, input.file.mimeType, fileName, undefined, { access: 'private' });
      uploaded.push(stored.fileId);
      signatureFileUrl = getSecureDocumentUrl(stored.fileId);
      if (input.method !== 'DRAWN') signedCopyDocument = { fileName, url: signatureFileUrl, size: input.file.buffer.length, mimeType: input.file.mimeType };
    }

    // The signed letter: the uploaded / offline scan itself, or the letter with the typed / drawn signature on it.
    let signedLetter = signedCopyDocument;
    let signedLetterHash: string | null = null;
    if (input.method === 'TYPED' || input.method === 'DRAWN') {
      const stamped = await buildSignedOfferLetter(letterBytes, {
        signature: input.signatureImage ?? (input.method === 'DRAWN' ? input.file?.buffer ?? null : null),
        signerName: input.acceptedName,
        signedOn: letterDay(acceptedAt),
        place: input.place,
        statement: signedLetterStatement({ signerName: input.acceptedName, acceptedAt, place: input.place, method: input.method, letterNo: letterText(offer, 'offerLetterNo') || offer.application.applicationRef }),
        letterNo: letterText(offer, 'offerLetterNo') || offer.application.applicationRef,
        companyName: letterText(offer, 'companyName') || 'JCB Exchange',
      }).catch((error: unknown) => {
        // The acceptance and its evidence never depend on drawing on the PDF: it is recorded without the signed copy.
        console.error('[offer] the signed offer letter could not be prepared:', error instanceof Error ? error.message : error);
        return null;
      });
      if (stamped) {
        const fileName = `Offer_Letter_Signed_${offer.application.applicationRef}_${safeName}.pdf`;
        const storedLetter = await uploadFileToDrive(stamped, 'application/pdf', fileName, undefined, { access: 'private' });
        uploaded.push(storedLetter.fileId);
        signedLetter = { fileName, url: getSecureDocumentUrl(storedLetter.fileId), size: stamped.length, mimeType: 'application/pdf' };
        signedLetterHash = sha256Hex(stamped);
      }
    }

    const imageForCertificate = input.file && (input.file.mimeType === 'image/png' || input.file.mimeType === 'image/jpeg') ? input.file.buffer : null;
    const certificate = await buildAcceptanceCertificatePdf({
      dateOnly: input.method === 'OFFLINE_HR',
      companyName: letterText(offer, 'companyName') || 'JCB Exchange',
      letterNo: letterText(offer, 'offerLetterNo') || offer.application.applicationRef,
      candidateName: offer.candidate.fullName,
      designation: offer.designation,
      department: offer.department,
      placeOfPosting: offer.joiningLocation,
      joiningDate: offer.joiningDate ? offer.joiningDate.toISOString().slice(0, 10) : '-',
      method: input.method,
      acceptedName: input.acceptedName,
      place: input.place,
      acceptedAt,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      documentHash,
      signatureHash,
      signedLetterHash,
      signatureImage: imageForCertificate,
      recordedBy: input.recordedByName ?? null,
      note: input.note ?? null,
    });
    const certificateName = `Offer_Acceptance_Certificate_${offer.application.applicationRef}_${safeName}.pdf`;
    const storedCertificate = await uploadFileToDrive(certificate, 'application/pdf', certificateName, undefined, { access: 'private' });
    uploaded.push(storedCertificate.fileId);
    const certificateUrl = getSecureDocumentUrl(storedCertificate.fileId);

    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.offer.updateMany({
        // Always the version that was read (and whose letter was hashed): an edit + resend meanwhile changes it.
        where: { id: offer.id, status: 'SENT', responseTokenVersion: input.tokenVersion ?? offer.responseTokenVersion },
        data: {
          status: 'ACCEPTED',
          respondedAt: acceptedAt,
          declineReason: null,
          acceptanceMethod: input.method,
          acceptedName: input.acceptedName,
          acceptedPlace: input.place,
          acceptedIp: input.ipAddress?.slice(0, 64) ?? null,
          acceptedUserAgent: input.userAgent?.slice(0, 500) ?? null,
          signatureFileUrl,
          signatureHash,
          documentHash,
          acceptanceCertificateUrl: certificateUrl,
          signedLetterUrl: signedLetter?.url ?? null,
          acceptanceNote: input.note ?? null,
          acceptedById: input.acceptedById ?? null,
          hrmHandoffStatus: 'PENDING',
          hrmHandoffError: null,
          hrmHandoffAttempts: 0,
          hrmHandoffAt: new Date(),
        },
      });
      if (result.count !== 1) throw new OfferAcceptanceConflict('This offer has already received a response or was changed. Refresh and check it.');

      await transaction.jobApplication.update({ where: { id: offer.applicationId }, data: { currentStage: 'OFFER_ACCEPTED', terminalStatus: null } });
      await transaction.applicationStageHistory.create({
        data: {
          applicationId: offer.applicationId,
          fromStage: offer.application.currentStage,
          toStage: 'OFFER_ACCEPTED',
          fromTerminalStatus: offer.application.terminalStatus,
          toTerminalStatus: null,
          changedById: input.acceptedById ?? null,
          notes: input.method === 'OFFLINE_HR' ? `Signed paper offer recorded by HR.${input.note ? ` ${input.note}` : ''}` : 'Candidate signed and accepted the offer.',
        },
      });
      if (signedLetter) {
        await transaction.candidateDocument.create({
          data: {
            candidateId: offer.candidateId, applicationId: offer.applicationId, category: 'OFFER_LETTER_SIGNED',
            fileName: signedLetter.fileName, fileUrl: signedLetter.url, fileSize: signedLetter.size, mimeType: signedLetter.mimeType,
          },
        });
      }
      await transaction.candidateDocument.create({
        data: {
          candidateId: offer.candidateId, applicationId: offer.applicationId, category: 'OFFER_ACCEPTANCE_CERTIFICATE',
          fileName: certificateName, fileUrl: certificateUrl, fileSize: certificate.length, mimeType: 'application/pdf',
        },
      });
      await transaction.recruitmentActivityLog.create({
        data: {
          candidateId: offer.candidateId,
          applicationId: offer.applicationId,
          actorId: input.acceptedById ?? null,
          action: 'OFFER_ACCEPTED',
          title: input.method === 'OFFLINE_HR' ? 'Signed Offer Recorded by HR' : 'Candidate Signed and Accepted Offer',
          details: METHOD_LABELS[input.method],
          metadata: {
            method: input.method,
            documentHash,
            ...(signatureHash ? { signatureHash } : {}),
            ...(signedLetterHash ? { signedLetterHash } : {}),
            ...(input.tokenVersion !== null ? { responseTokenVersion: input.tokenVersion, source: 'PUBLIC_OFFER_LINK' } : { source: 'HR_OFFLINE' }),
            ...(input.ipAddress ? { ip: input.ipAddress } : {}),
            ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 500) } : {}),
          },
        },
      });
      return transaction.offer.findUniqueOrThrow({ where: { id: offer.id } });
    });
    return updated;
  } catch (error) {
    await Promise.all(uploaded.map((fileId) => deleteFileFromDrive(fileId).catch(() => undefined)));
    throw error;
  }
};
