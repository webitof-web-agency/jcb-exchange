import type { Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { extractDriveFileId } from '../../../services/googleDrive.service';
import { normalizeProfileMobile } from '../../../utils/profileMobile';
import { normalizeSalaryComponents, totalSalaryComponents } from '../../../utils/offerRules';
import { writeHrmAudit } from '../audit';
import { HrmConflictError, HrmHttpError, HrmNotFoundError } from '../errors';
import { lockEmployeeAssignments, syncOfficePrimaryManager, WORKING_STATUSES } from '../officeAssignments';
import { normalizePersonName } from '../../../utils/offerAcceptanceEvidence';
import { ensureStateOffice, findActiveHeadOffice } from '../officeUnits';
import { findEmployeeMatches, nextEmployeeCode } from './employeeOnboarding.service';

/**
 * Accepted offer -> HRM pre-joining record. Runs as a system step (not as the person who clicked anything), so no
 * user permission or scope applies; the audit names the offer's creator (or whoever recorded the acceptance, or an
 * active Super Admin) and marks the source.
 *
 * It creates, in one transaction:
 *  - the HR record (EMP-0001 sequence, status PRE_ONBOARDING, personal email / mobile from the candidate),
 *    or re-opens the record of somebody who left and is hired again;
 *  - the assignment from the offer's placement (department, designation, office, State Manager flag, reporting
 *    manager), effective on the joining date;
 *  - a salary revision PENDING_APPROVAL from the offer's breakup / CTC;
 *  - the offer letter, the signed copy and the acceptance certificate as verified HR documents;
 *  - the acceptance evidence and an onboarding case (IN_PROGRESS).
 * A person who already has a live HR record is not created twice: the case is NEEDS_REVIEW for HR to decide.
 * Anything from the offer that cannot be applied any more (department switched off, ...) is noted on the case
 * instead of failing the whole handoff. Running it again for the same offer does nothing.
 */

export type OfferHandoffResult =
  | { outcome: 'CREATED' | 'REHIRED' | 'ALREADY_DONE'; employeeId: string; caseId: string; notes: string[] }
  | { outcome: 'NEEDS_REVIEW'; caseId: string; notes: string[] };

const MAX_ERROR_LENGTH = 1000;
const LEFT_STATUSES = ['EXITED', 'TERMINATED'] as const;

type Tx = Prisma.TransactionClient;

const resolveSystemActor = async (offer: { createdById: string | null; acceptedById: string | null }) => {
  for (const id of [offer.createdById, offer.acceptedById]) {
    if (!id) continue;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (user) return { userId: user.id, role: user.role };
  }
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, select: { id: true, role: true }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new HrmConflictError('No user is available to record the HRM handoff (no offer creator and no active Super Admin).');
  return { userId: admin.id, role: admin.role };
};

const dayOf = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const loadOffer = (offerId: string) => prisma.offer.findUnique({
  where: { id: offerId },
  include: { candidate: true, application: { select: { id: true, applicationRef: true } }, job: { select: { title: true } } },
});
type LoadedOffer = NonNullable<Awaited<ReturnType<typeof loadOffer>>>;

const letterNo = (offer: LoadedOffer) => {
  const data = offer.offerLetterData && typeof offer.offerLetterData === 'object' ? offer.offerLetterData as Record<string, unknown> : {};
  return typeof data.offerLetterNo === 'string' && data.offerLetterNo ? data.offerLetterNo : offer.application.applicationRef;
};

/** The office for the offer's placement, or why it cannot be used any more. */
const resolveOffice = async (tx: Tx, actor: { userId: string; role: string }, offer: LoadedOffer): Promise<{ officeUnitId: string } | { note: string }> => {
  if (offer.locationType === 'HEAD_OFFICE') {
    const headOffice = await findActiveHeadOffice(tx);
    return headOffice ? { officeUnitId: headOffice.id } : { note: 'The head office is not set up or is switched off, so no assignment was made.' };
  }
  if (offer.locationType === 'STATE_OFFICE' && offer.stateId) {
    try {
      // The system may add the state office (the offer already chose that state).
      return { officeUnitId: (await ensureStateOffice(tx, actor, offer.stateId, true)).unit.id };
    } catch (error) {
      if (error instanceof HrmHttpError) return { note: `${error.message} No assignment was made.` };
      throw error;
    }
  }
  return { note: 'The offer has no HRM placement (it was made before placements existed). Add the assignment from the profile.' };
};

const createDocuments = async (tx: Tx, employeeId: string, offer: LoadedOffer, uploadedById: string) => {
  const now = new Date();
  const rows: Array<{ category: 'OFFER' | 'ACCEPTANCE'; title: string; url: string | null; mimeType: string; kind: string }> = [
    { category: 'OFFER', title: `Offer letter ${letterNo(offer)}`, url: offer.offerLetterUrl, mimeType: 'application/pdf', kind: 'OFFER_LETTER' },
    { category: 'ACCEPTANCE', title: 'Offer acceptance certificate', url: offer.acceptanceCertificateUrl, mimeType: 'application/pdf', kind: 'ACCEPTANCE_CERTIFICATE' },
  ];
  if (offer.signatureFileUrl && offer.acceptanceMethod !== 'DRAWN') {
    const signed = await tx.candidateDocument.findFirst({ where: { fileUrl: offer.signatureFileUrl }, select: { mimeType: true } });
    rows.push({ category: 'ACCEPTANCE', title: 'Signed offer letter', url: offer.signatureFileUrl, mimeType: signed?.mimeType || 'application/pdf', kind: 'SIGNED_OFFER_LETTER' });
  }
  for (const row of rows) {
    if (!row.url) continue;
    await tx.hrmEmployeeDocument.create({
      data: {
        employeeId,
        category: row.category,
        title: row.title.slice(0, 160),
        fileRef: row.url.slice(0, 500),
        driveFileId: extractDriveFileId(row.url),
        mimeType: row.mimeType,
        provider: 'GOOGLE_DRIVE',
        providerReference: `OFFER:${offer.id}`.slice(0, 200),
        // These come from the recruitment record itself (generated / signed through the offer flow).
        status: 'VERIFIED',
        verifiedAt: now,
        uploadedById,
        metadata: { source: 'RECRUITMENT_OFFER', kind: row.kind, offerId: offer.id, ...(row.kind === 'OFFER_LETTER' && offer.documentHash ? { sha256: offer.documentHash } : {}) },
      },
    });
  }
};

const createSalaryDraft = async (tx: Tx, employeeId: string, offer: LoadedOffer, effectiveFrom: Date, createdById: string) => {
  const parsed = normalizeSalaryComponents(offer.salaryComponents ?? null);
  const components = 'error' in parsed ? [] : parsed.components;
  const totals = totalSalaryComponents(components);
  const annualCtc = offer.annualCtc !== null ? Number(offer.annualCtc) : (components.length ? totals.annualCtc : null);
  if (!annualCtc && !components.length) return null;
  const basic = components.find((component) => component.code === 'BASIC')?.monthlyAmount ?? 0;
  return tx.hrmCompensationRevision.create({
    data: {
      employeeId,
      effectiveFrom,
      currency: 'INR',
      baseSalary: basic,
      grossSalary: totals.grossMonthly,
      annualCtc,
      // HR approves the salary before it is used (payroll reads approved revisions only).
      status: 'PENDING_APPROVAL',
      reason: `From accepted offer ${letterNo(offer)}${components.length ? '' : ' (CTC only: add the breakup)'}`,
      createdById,
      ...(components.length ? { components: {
        create: components.map((component) => ({
          code: component.code,
          name: component.name,
          componentType: component.componentType,
          amount: component.monthlyAmount,
          isRecurring: true,
          isTaxable: component.componentType === 'EARNING',
        })),
      } } : {}),
    },
    select: { id: true },
  });
};

/** HR decisions on a NEEDS_REVIEW case: a different person (ignore matches), or the same person who left (rehire). */
export type OfferHandoffOptions = { ignoreMatches?: boolean; rehireEmployeeId?: string };

const doHandoff = async (offer: LoadedOffer, options: OfferHandoffOptions = {}): Promise<OfferHandoffResult> => {
  const actor = await resolveSystemActor(offer);
  const audit = (tx: Tx, entityType: 'HRM_EMPLOYEE' | 'HRM_ONBOARDING' | 'HRM_ASSIGNMENT', entityId: string, action: string, after: unknown) =>
    writeHrmAudit({ actorUserId: actor.userId, entityType, entityId, action, after: { ...(after as object), source: 'SYSTEM_OFFER_ACCEPTANCE', offerId: offer.id } }, tx);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`hrm-offer-handoff:${offer.id}`}))`;
    const existingCase = await tx.hrmOnboardingCase.findFirst({ where: { offerId: offer.id }, orderBy: { createdAt: 'asc' } });
    if (existingCase && ['CANCELLED', 'REJECTED', 'COMPLETED'].includes(existingCase.status)) {
      throw new HrmHttpError(409, 'ONBOARDING_CLOSED', `This onboarding case is already ${existingCase.status.toLowerCase()}, so the offer is not handed to HRM again.`);
    }
    if (existingCase?.employeeId) {
      // Done earlier (maybe by a run whose result was not written back): make the offer say so.
      await tx.offer.update({ where: { id: offer.id }, data: { hrmHandoffStatus: 'DONE', hrmEmployeeId: existingCase.employeeId, hrmHandoffAt: new Date() } });
      return { outcome: 'ALREADY_DONE', employeeId: existingCase.employeeId, caseId: existingCase.id, notes: [] };
    }
    // The same lock Add Employee takes: the duplicate check below and the new record are one step for both.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'hrm-employee-code'}))`;
    const found = options.ignoreMatches ? [] : await findEmployeeMatches(offer.candidate.email, offer.candidate.mobile, tx);
    let chosen: (typeof found)[number] | null = null;
    if (options.rehireEmployeeId) {
      const record = await tx.hrmEmployee.findFirst({
        where: { id: options.rehireEmployeeId, archivedAt: null },
        select: { id: true, employeeCode: true, legalName: true, userId: true, status: true, mobile: true },
      });
      if (!record) throw new HrmNotFoundError('The HR record to re-hire was not found.');
      if (!(LEFT_STATUSES as readonly string[]).includes(record.status)) {
        throw new HrmConflictError(`${record.legalName} (${record.employeeCode}) is still ${record.status.toLowerCase().replace(/_/g, ' ')}: only somebody who left can be re-hired. Use Transfer for a move inside the company.`);
      }
      chosen = { ...record, matchedByEmail: true, matchedByMobile: false };
    }
    const matches = chosen ? [chosen] : found;

    const notes: string[] = [];
    const joiningDate = offer.joiningDate ? dayOf(offer.joiningDate) : null;
    const caseData = {
      candidateId: offer.candidateId,
      applicationId: offer.applicationId,
      offerId: offer.id,
      source: 'RECRUITMENT' as const,
      targetJoiningDate: joiningDate,
      initiatedById: actor.userId,
    };

    // Re-opening an old record only when it is clearly the same person: exactly one match, who left, with the same
    // email and the same name. Anything else (a live record, several records, a mobile-only or different-name
    // match) is for HR to decide.
    const only = matches.length === 1 ? matches[0]! : null;
    const rehire = chosen ?? (only && (LEFT_STATUSES as readonly string[]).includes(only.status) && only.matchedByEmail
      && normalizePersonName(only.legalName) === normalizePersonName(offer.candidate.fullName)
      ? only
      : null);
    const match = matches[0] ?? null;
    if (match && !rehire) {
      const list = matches.map((row) => `${row.legalName} (${row.employeeCode}, ${row.status.toLowerCase()}, same ${row.matchedByEmail ? 'email' : 'mobile'})`).join('; ');
      const note = `An HR record already exists with this email or mobile number: ${list}. Check whether this is the same person before continuing (archive or correct the other record, then retry).`;
      const reviewCase = existingCase
        ? await tx.hrmOnboardingCase.update({ where: { id: existingCase.id }, data: { status: 'NEEDS_REVIEW', reviewNote: note } })
        : await tx.hrmOnboardingCase.create({ data: { ...caseData, status: 'NEEDS_REVIEW', reviewNote: note, idempotencyKey: `offer:${offer.id}` } });
      await tx.offer.update({ where: { id: offer.id }, data: { hrmHandoffStatus: 'NEEDS_REVIEW', hrmHandoffError: note, hrmHandoffAt: new Date() } });
      await audit(tx, 'HRM_ONBOARDING', reviewCase.id, 'OFFER_HANDOFF_NEEDS_REVIEW', { matchEmployeeId: match.id });
      return { outcome: 'NEEDS_REVIEW', caseId: reviewCase.id, notes: [note] };
    }

    // ---- the HR record ----
    const mobile = offer.candidate.mobile ? normalizeProfileMobile(offer.candidate.mobile) : null;
    let employeeId: string;
    let rehireSnapshot: Record<string, unknown> | null = null;
    if (rehire) {
      await lockEmployeeAssignments(tx, rehire.id);
      const prior = await tx.hrmEmployee.findUniqueOrThrow({ where: { id: rehire.id }, select: { status: true, joinedOn: true, exitDate: true, source: true, candidateId: true, applicationId: true, offerId: true } });
      rehireSnapshot = { employee: prior, assignments: [], salaries: [], shifts: [], scopes: [] };
      await tx.hrmEmployee.update({
        where: { id: rehire.id },
        data: {
          status: 'PRE_ONBOARDING', joinedOn: joiningDate, exitDate: null, source: 'RECRUITMENT',
          candidateId: offer.candidateId, applicationId: offer.applicationId, offerId: offer.id,
          version: { increment: 1 },
        },
      });
      employeeId = rehire.id;
      notes.push(`Re-hire: ${rehire.legalName} (${rehire.employeeCode}) left earlier; the same HR record was re-opened.${rehire.userId ? ' Their old login stays switched off until Confirm joining.' : ''}`);
      if (joiningDate) {
        // The earlier employment is over: open assignments end (or are cancelled if they would start later), the old
        // salary stops, and HRM access scopes of the old login end.
        const dayBefore = new Date(joiningDate.getTime() - 86_400_000);
        const open = await tx.hrmEmploymentAssignment.findMany({
          where: { employeeId: rehire.id, status: { in: ['ACTIVE', 'PLANNED'] }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: joiningDate } }] },
          select: { id: true, effectiveFrom: true, officeUnitId: true },
        });
        for (const row of open) {
          const before = await tx.hrmEmploymentAssignment.findUniqueOrThrow({ where: { id: row.id }, select: { status: true, effectiveTo: true } });
          (rehireSnapshot!.assignments as unknown[]).push({ id: row.id, ...before });
          await tx.hrmEmploymentAssignment.update({
            where: { id: row.id },
            data: row.effectiveFrom.getTime() >= joiningDate.getTime() ? { status: 'CANCELLED' } : { status: 'ENDED', effectiveTo: dayBefore },
          });
        }
        // The old shift ends too (a new one is assigned for the new joining).
        const oldShifts = await tx.hrmShiftAssignment.findMany({ where: { employeeId: rehire.id, status: 'ACTIVE', OR: [{ effectiveTo: null }, { effectiveTo: { gte: joiningDate } }] }, select: { id: true, status: true, effectiveTo: true, effectiveFrom: true } });
        for (const row of oldShifts) {
          (rehireSnapshot!.shifts as unknown[]).push({ id: row.id, status: row.status, effectiveTo: row.effectiveTo });
          await tx.hrmShiftAssignment.update({ where: { id: row.id }, data: row.effectiveFrom.getTime() >= joiningDate.getTime() ? { status: 'CANCELLED' } : { effectiveTo: dayBefore } });
        }
        const openSalaries = await tx.hrmCompensationRevision.findMany({
          where: { employeeId: rehire.id, OR: [{ effectiveFrom: { lt: joiningDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: joiningDate } }] }, { effectiveFrom: { gte: joiningDate }, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } }] },
          select: { id: true, status: true, effectiveTo: true },
        });
        (rehireSnapshot!.salaries as unknown[]).push(...openSalaries);
        for (const officeUnitId of new Set(open.map((row) => row.officeUnitId).filter((value): value is string => Boolean(value)))) {
          await syncOfficePrimaryManager(tx, officeUnitId);
        }
        await tx.hrmCompensationRevision.updateMany({
          where: { employeeId: rehire.id, effectiveFrom: { lt: joiningDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: joiningDate } }] },
          data: { effectiveTo: dayBefore },
        });
        await tx.hrmCompensationRevision.updateMany({
          where: { employeeId: rehire.id, effectiveFrom: { gte: joiningDate }, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } },
          data: { status: 'SUPERSEDED' },
        });
      }
      if (rehire.userId) {
        const scopes = await tx.hrmAccessScope.findMany({ where: { userId: rehire.userId, OR: [{ activeTo: null }, { activeTo: { gte: new Date() } }] }, select: { id: true, activeTo: true } });
        (rehireSnapshot!.scopes as unknown[]).push(...scopes);
        await tx.hrmAccessScope.updateMany({ where: { userId: rehire.userId, OR: [{ activeTo: null }, { activeTo: { gte: new Date() } }] }, data: { activeTo: new Date(Date.now() - 86_400_000) } });
      }
      await audit(tx, 'HRM_EMPLOYEE', employeeId, 'REHIRED_FROM_ACCEPTED_OFFER', { joiningDate });
    } else {
      const employee = await tx.hrmEmployee.create({
        data: {
          employeeCode: await nextEmployeeCode(tx),
          source: 'RECRUITMENT',
          status: 'PRE_ONBOARDING',
          legalName: offer.candidate.fullName,
          // The work email comes with the login (Confirm joining); the candidate's own address is personal.
          personalEmail: offer.candidate.email?.trim().toLowerCase() || null,
          mobile: mobile || null,
          joinedOn: joiningDate,
          candidateId: offer.candidateId,
          applicationId: offer.applicationId,
          offerId: offer.id,
          createdById: actor.userId,
        },
        select: { id: true, employeeCode: true, legalName: true },
      });
      employeeId = employee.id;
      await audit(tx, 'HRM_EMPLOYEE', employee.id, 'CREATED_FROM_ACCEPTED_OFFER', employee);
    }

    // ---- placement ----
    if (!joiningDate) {
      notes.push('The offer has no joining date: add the assignment and salary from the profile.');
    } else if (!offer.hrmOrgUnitId || !offer.locationType || !offer.stateId) {
      notes.push('The offer has no HRM placement (made before placements existed): add the assignment from the profile.');
    } else {
      const department = await tx.hrmOrgUnit.findFirst({ where: { id: offer.hrmOrgUnitId, type: 'DEPARTMENT', isActive: true }, select: { id: true } });
      const office = department ? await resolveOffice(tx, actor, offer) : null;
      if (!department) notes.push('The offer\'s department is switched off or was removed: add the assignment from the profile.');
      else if (office && 'note' in office) notes.push(office.note);
      else if (office) {
        let managerEmployeeId = offer.reportingManagerEmployeeId;
        if (managerEmployeeId) {
          const manager = await tx.hrmEmployee.findFirst({ where: { id: managerEmployeeId, status: { in: [...WORKING_STATUSES] }, archivedAt: null }, select: { id: true } });
          if (!manager || managerEmployeeId === employeeId) {
            notes.push('The reporting manager on the offer is no longer available: choose one from the profile.');
            managerEmployeeId = null;
          }
        }
        const assignment = await tx.hrmEmploymentAssignment.create({
          data: {
            employeeId,
            orgUnitId: department.id,
            officeUnitId: office.officeUnitId,
            isOfficeManager: offer.locationType === 'STATE_OFFICE' && offer.isOfficeManager,
            designation: offer.designation.slice(0, 120),
            employmentType: offer.employmentType ?? 'FULL_TIME',
            stateId: offer.stateId,
            cityId: offer.cityId,
            managerEmployeeId,
            // ACTIVE from the joining date: every reader also requires effectiveFrom <= today.
            status: 'ACTIVE',
            effectiveFrom: joiningDate,
            reason: `From accepted offer ${letterNo(offer)}`,
            createdById: actor.userId,
          },
          select: { id: true, officeUnitId: true, isOfficeManager: true },
        });
        if (assignment.isOfficeManager) await syncOfficePrimaryManager(tx, assignment.officeUnitId);
        await audit(tx, 'HRM_ASSIGNMENT', assignment.id, 'CREATED_FROM_ACCEPTED_OFFER', { officeUnitId: assignment.officeUnitId });
      }
    }
    // The salary does not depend on the placement: an offer without one still carries its CTC.
    if (joiningDate) {
      const salary = await createSalaryDraft(tx, employeeId, offer, joiningDate, actor.userId);
      if (!salary) notes.push('The offer has no salary amount: add the salary from the profile.');
    }

    await createDocuments(tx, employeeId, offer, actor.userId);

    // ---- case + evidence ----
    const reviewNote = notes.length ? notes.join(' ') : null;
    const onboardingCase = existingCase
      ? await tx.hrmOnboardingCase.update({ where: { id: existingCase.id }, data: { ...caseData, employeeId, status: 'IN_PROGRESS', reviewNote, ...(rehireSnapshot ? { rehireSnapshot: rehireSnapshot as Prisma.InputJsonValue } : {}) } })
      : await tx.hrmOnboardingCase.create({ data: { ...caseData, employeeId, status: 'IN_PROGRESS', reviewNote, idempotencyKey: `offer:${offer.id}`, ...(rehireSnapshot ? { rehireSnapshot: rehireSnapshot as Prisma.InputJsonValue } : {}) } });
    await tx.hrmOfferAcceptanceEvidence.upsert({
      where: { onboardingCaseId: onboardingCase.id },
      update: {},
      create: {
        onboardingCaseId: onboardingCase.id,
        offerId: offer.id,
        responseAction: 'ACCEPTED',
        acceptedAt: offer.respondedAt ?? new Date(),
        signatureCaptured: Boolean(offer.acceptanceMethod),
        signatureFileRef: offer.signatureFileUrl ?? offer.acceptanceCertificateUrl,
        signatureHash: offer.signatureHash ?? offer.documentHash,
        ipAddress: offer.acceptedIp,
        userAgent: offer.acceptedUserAgent,
        legalDisclaimer: offer.acceptanceMethod
          ? `Accepted by ${offer.acceptanceMethod.toLowerCase().replace(/_/g, ' ')} signature; offer letter SHA-256 ${offer.documentHash ?? 'not recorded'}. Simple electronic record, not Aadhaar eSign / DSC.`
          : 'Offer status is recorded as acceptance evidence; it is not a legally certified digital signature.',
      },
    });
    await tx.offer.update({ where: { id: offer.id }, data: { hrmHandoffStatus: 'DONE', hrmHandoffError: reviewNote, hrmHandoffAt: new Date(), hrmEmployeeId: employeeId } });
    await audit(tx, 'HRM_ONBOARDING', onboardingCase.id, 'CREATED_FROM_ACCEPTED_OFFER', { employeeId, notes });
    return { outcome: rehire ? 'REHIRED' : 'CREATED', employeeId, caseId: onboardingCase.id, notes };
  }, { timeout: 30000, maxWait: 5000 });
};

/** Hands one accepted offer to HRM. Throws for an offer that is not accepted; records any failure on the offer. */
export const handOfferToHrm = async (offerId: string, options: OfferHandoffOptions = {}): Promise<OfferHandoffResult> => {
  const offer = await loadOffer(offerId);
  if (!offer) throw new HrmNotFoundError('Recruitment offer not found.');
  if (offer.status !== 'ACCEPTED') throw new HrmConflictError('Only an accepted offer can start HRM onboarding.');
  try {
    return await doHandoff(offer, options);
  } catch (error) {
    // A closed (cancelled / dismissed) case is a decision, not a failure: nothing to retry.
    if (error instanceof HrmHttpError && error.code === 'ONBOARDING_CLOSED') throw error;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);
    // Only if it is not done meanwhile (a parallel run may have finished it).
    await prisma.offer.updateMany({
      where: { id: offerId, NOT: { hrmHandoffStatus: 'DONE' } },
      data: { hrmHandoffStatus: 'FAILED', hrmHandoffError: message, hrmHandoffAttempts: { increment: 1 }, hrmHandoffAt: new Date() },
    }).catch(() => undefined);
    throw error;
  }
};

/** Same, but never throws (used right after an acceptance, where the answer to the candidate must not fail). */
export const handOfferToHrmQuietly = async (offerId: string) => {
  try {
    return await handOfferToHrm(offerId);
  } catch (error) {
    console.error(`[hrm] offer ${offerId} could not be handed to HRM (it will be retried):`, error instanceof Error ? error.message : error);
    return null;
  }
};

const MAX_ATTEMPTS = 5;

/**
 * Background retry (outbox worker tick): accepted offers whose handoff failed, or never ran (server restart right
 * after an acceptance). Waits 2, 4, 8, 16 minutes between attempts; after 5 failures HR retries by hand.
 */
export const retryPendingOfferHandoffs = async (now = new Date()) => {
  const candidates = await prisma.offer.findMany({
    where: { status: 'ACCEPTED', hrmHandoffStatus: { in: ['PENDING', 'FAILED'] }, hrmHandoffAttempts: { lt: MAX_ATTEMPTS } },
    select: { id: true, hrmHandoffAttempts: true, hrmHandoffAt: true, respondedAt: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
    take: 20,
  });
  let processed = 0;
  for (const offer of candidates) {
    const last = offer.hrmHandoffAt ?? offer.updatedAt;
    const waitMs = 2 ** Math.max(1, offer.hrmHandoffAttempts) * 60_000;
    if (now.getTime() - last.getTime() < waitMs) continue;
    await handOfferToHrmQuietly(offer.id);
    processed += 1;
  }
  return { processed };
};
