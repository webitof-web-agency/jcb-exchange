import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { removeListingMediaFiles, removeListingsInTx } from './listingDeletion.service';
import {
  assertDeleteRequest,
  DeletionBlockedError,
  finishImpact,
  group,
  type DeletionAlternative,
  type DeletionGroup,
  type DeletionImpact,
} from './deletionImpact';

// Permanent delete of a customer, staff member or partner account, and the impact shown before it.
// Money, legal and audit history (payments, Prime, signed agreements, deposits, paid verifications,
// audit logs, won deals, Finance Hub parties) is never deleted: while any exists the account can
// only be deactivated, suspended, blocked or closed. Only a super admin may permanently delete.

type Db = Prisma.TransactionClient | typeof prisma;
const anyDb = (db: Db) => db as any;

export type AccountDeletionViewer = { id: string; role: string };

// Paid verification lookups and API usage are billing records, all linked by requestedById.
const VERIFICATION_DELEGATES = [
  'panVerificationRecord', 'panVerificationTemplate', 'aadhaarVerificationRecord', 'aadhaarVerificationTemplate',
  'mobileToPanLookupRecord', 'gstVerificationRecord', 'gstVerificationTemplate', 'drivingLicenseVerificationRecord',
  'drivingLicenseVerificationTemplate', 'rcOwnerHistoryRecord', 'rcOwnerHistoryTemplate', 'rcChallanVerificationRecord',
  'chassisToRcVerificationRecord', 'rcToMobileVerificationRecord', 'mobileToRcLookupRecord', 'rcMobileNumberCheckRecord',
  'apiUsageRecord',
];

// Deposits that never involved money can go with the partner; any other state is a money trail.
const DELETABLE_DEPOSIT_STATUSES = ['NOT_SUBMITTED', 'REJECTED'];

const ACCOUNT_ALTERNATIVES: DeletionAlternative[] = [
  { status: 'INACTIVE', label: 'Deactivate', description: 'Sign-in is paused. Reactivate any time; nothing is lost.' },
  { status: 'SUSPENDED', label: 'Suspend', description: 'Temporary ban for misuse. Sign-in stops and partner listings are hidden.' },
  { status: 'BLOCKED', label: 'Block', description: 'Permanent ban. Sign-in stops and partner listings are hidden.' },
  { status: 'CLOSED', label: 'Close account', description: 'Account closed (left the company or asked to close). History stays for records.' },
];

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

const loadTarget = (db: Db, userId: string) => anyDb(db).user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    name: true,
    email: true,
    mobile: true,
    role: true,
    status: true,
    partnerProfile: { select: { id: true, businessName: true } },
  },
});

/** The user's own listings split into ones that can go with the account and ones with sale/money history. */
const splitListings = async (db: Db, userId: string) => {
  const listings = await anyDb(db).listing.findMany({
    where: { partnerId: userId },
    select: { id: true, status: true, saleRecord: { select: { id: true } }, sellAccount: { select: { id: true } }, _count: { select: { paymentSubmissions: true, media: true } } },
  });
  const ids = listings.map((item: any) => item.id);
  const released = ids.length
    ? await db.sellAccount.findMany({ where: { releasedListingId: { in: ids } }, select: { releasedListingId: true } })
    : [];
  const releasedIds = new Set(released.map((item) => item.releasedListingId));
  const withHistory = listings.filter((item: any) => String(item.status).toUpperCase() === 'SOLD'
    || item.saleRecord || item.sellAccount || item._count.paymentSubmissions > 0 || releasedIds.has(item.id));
  const historyIds = new Set(withHistory.map((item: any) => item.id));
  const deletable = listings.filter((item: any) => !historyIds.has(item.id));
  return {
    deletableIds: deletable.map((item: any) => item.id) as string[],
    deletableMediaCount: deletable.reduce((total: number, item: any) => total + item._count.media, 0) as number,
    historyCount: withHistory.length,
  };
};

const splitLeads = async (db: Db, userId: string) => {
  const leads = await db.lead.findMany({
    where: { OR: [{ customerId: userId }, { dealerId: userId }] },
    select: { id: true, status: true, wonSellAccountId: true },
  });
  const won = leads.filter((lead) => lead.status === 'WON' || lead.wonSellAccountId);
  const wonIds = new Set(won.map((lead) => lead.id));
  return { deletableIds: leads.filter((lead) => !wonIds.has(lead.id)).map((lead) => lead.id), wonCount: won.length };
};

const countVerificationRecords = async (db: Db, userId: string) =>
  sum(await Promise.all(VERIFICATION_DELEGATES.map((delegate) => anyDb(db)[delegate].count({ where: { requestedById: userId } }))));

const buildAccountImpact = async (db: Db, userId: string, viewer: AccountDeletionViewer) => {
  const target = await loadTarget(db, userId);
  if (!target) return null;
  const d = anyDb(db);
  const profileId: string | null = target.partnerProfile?.id || null;
  const entityType: DeletionImpact['entityType'] = target.role === 'CUSTOMER' ? 'CUSTOMER' : profileId ? 'PARTNER' : 'STAFF';

  const [listings, leads, verificationRecords, counts] = await Promise.all([
    splitListings(db, userId),
    splitLeads(db, userId),
    countVerificationRecords(db, userId),
    Promise.all([
      d.notification.count({ where: { userId } }),
      d.mobileOtpChallenge.count({ where: { userId } }),
      d.emailOtpChallenge.count({ where: { userId } }),
      d.adminPermission.count({ where: { adminUserId: userId } }),
      d.blogQuestion.count({ where: { askedById: userId } }),
      d.crmContactProfile.count({ where: { userId } }),
      d.crmFollowUp.count({ where: { contactUserId: userId } }),
      d.partnerTeamMember.count({ where: { userId } }),
      // Assigned work that becomes unassigned.
      d.lead.count({ where: { ownerId: userId } }),
      d.crmContactProfile.count({ where: { ownerId: userId } }),
      d.crmFollowUp.count({ where: { ownerId: userId } }),
      // Work they reviewed or approved: kept, the reviewer is cleared.
      Promise.all([
        d.kycDocument.count({ where: { reviewedById: userId } }),
        d.partnerDeposit.count({ where: { verifiedById: userId } }),
        d.customerPrimeSubscription.count({ where: { OR: [{ approvedByUserId: userId }, { rejectedByUserId: userId }] } }),
        d.listingPaymentSubmission.count({ where: { reviewedByUserId: userId } }),
        d.partnerProfile.count({ where: { approvedById: userId } }),
        d.listingBill.count({ where: { createdByUserId: userId } }),
        d.leadActivity.count({ where: { actorId: userId } }),
        d.blogQuestion.count({ where: { answeredById: userId } }),
        d.apiWalletLedger.count({ where: { requestedById: userId } }),
      ]).then(sum),
      Promise.all([
        d.job.count({ where: { createdById: userId } }),
        d.jobApplication.count({ where: { assignedRecruiterId: userId } }),
        d.applicationStageHistory.count({ where: { changedById: userId } }),
        d.interview.count({ where: { OR: [{ interviewerId: userId }, { createdById: userId }] } }),
        d.offer.count({ where: { createdById: userId } }),
        d.recruitmentActivityLog.count({ where: { actorId: userId } }),
      ]).then(sum),
      d.user.count({ where: { createdById: userId } }),
      // History that is never deleted.
      d.listingPaymentSubmission.count({ where: { OR: [{ buyerId: userId }, { partnerId: userId }] } }),
      d.customerPrimeSubscription.count({ where: { userId } }),
      d.auditLog.count({ where: { actorUserId: userId } }),
      d.kycReviewLog.count({ where: { actorUserId: userId, ...(profileId ? { NOT: { partnerProfileId: profileId } } : {}) } }),
      d.partnerAgreement.count({ where: { OR: [{ acceptedByUserId: userId }, ...(profileId ? [{ partnerProfileId: profileId }] : [])] } }),
      Promise.all([
        d.candidateNote.count({ where: { authorId: userId } }),
        d.candidateRating.count({ where: { evaluatorId: userId } }),
        d.interviewFeedback.count({ where: { interviewerId: userId } }),
      ]).then(sum),
      d.finPartyLink.count({
        where: { OR: [{ linkType: 'USER', linkId: userId }, ...(profileId ? [{ linkType: 'PARTNER_PROFILE', linkId: profileId }] : [])] },
      }),
    ]),
  ]);
  const [
    notifications, mobileOtps, emailOtps, permissions, blogQuestions, crmContacts, crmContactFollowUps, teamMemberships,
    ownedLeads, ownedContacts, ownedFollowUps, reviewedWork, recruitmentWork, createdUsers,
    payments, primeSubscriptions, auditLogs, kycReviewHistory, agreements, recruitmentNotes, financeParties,
  ] = counts;

  const partnerGroups: DeletionGroup[] = [];
  if (profileId) {
    const [kycDocuments, kycReviewLogs, deposits, moneyDeposits, partnerTeam, categories] = await Promise.all([
      d.kycDocument.count({ where: { partnerProfileId: profileId } }),
      d.kycReviewLog.count({ where: { partnerProfileId: profileId } }),
      d.partnerDeposit.count({ where: { partnerProfileId: profileId, status: { in: DELETABLE_DEPOSIT_STATUSES } } }),
      d.partnerDeposit.count({ where: { partnerProfileId: profileId, status: { notIn: DELETABLE_DEPOSIT_STATUSES } } }),
      d.partnerTeamMember.count({ where: { partnerProfileId: profileId } }),
      d.category.count({ where: { partnerProfileId: profileId } }),
    ]);
    partnerGroups.push(
      group('kycDocuments', 'KYC documents and review history', kycDocuments + kycReviewLogs, 'DELETED'),
      group('pendingDeposits', 'Unpaid or rejected deposit requests', deposits, 'DELETED'),
      group('partnerCategories', "Partner's own categories", categories, 'DELETED'),
      group('partnerTeam', "Team members' access to this partner", partnerTeam, 'DELETED', 'The team members keep their own accounts.'),
      group('deposits', 'Security deposits (money)', moneyDeposits, 'BLOCKS'),
    );
  }

  const selfOrOwner = target.role === 'SUPER_ADMIN'
    ? 'Super admin accounts cannot be deleted.'
    : target.id === viewer.id ? 'You cannot delete your own account.' : null;
  const viewerIsSuperAdmin = viewer.role === 'SUPER_ADMIN';

  const impact = finishImpact(
    {
      entityType,
      entityId: target.id,
      name: target.partnerProfile?.businessName || target.name || target.email,
      subtitle: [target.email, target.mobile].filter(Boolean).join(' · '),
      currentStatus: String(target.status || 'ACTIVE'),
      viewerCanDelete: viewerIsSuperAdmin && !selfOrOwner,
      viewerDeleteNote: selfOrOwner || (viewerIsSuperAdmin ? null : 'Only a super admin can permanently delete accounts. You can deactivate, suspend, block or close it.'),
      alternatives: target.role === 'SUPER_ADMIN' || target.id === viewer.id
        ? []
        : ACCOUNT_ALTERNATIVES.filter((item) => item.status !== String(target.status || 'ACTIVE')),
    },
    [
      group('notifications', 'Notifications', notifications, 'DELETED'),
      group('loginCodes', 'Sign-in codes', mobileOtps + emailOtps, 'DELETED'),
      group('permissions', 'Admin permissions', permissions, 'DELETED'),
      group('blogQuestions', 'Blog questions they asked', blogQuestions, 'DELETED'),
      group('crmContact', 'CRM contact card, follow-ups and activity', crmContacts + crmContactFollowUps, 'DELETED'),
      ...partnerGroups.filter((item) => item.action === 'DELETED'),
      group('listings', 'Listings without a sale or payment (with their photos and videos)', listings.deletableIds.length, 'DELETED'),
      group('leads', 'Enquiries (leads) and their CRM history', leads.deletableIds.length, 'DELETED'),
      group('teamMemberships', 'Access to partner teams', teamMemberships, 'DELETED'),
      group('listingFiles', "Also remove those listings' photo and video files from Google Drive", listings.deletableIds.length ? listings.deletableMediaCount : 0, 'OPTIONAL',
        'Left unticked, the files stay in Google Drive but nothing in the app links to them.'),
      group('assignedWork', 'Leads, contacts and follow-ups assigned to them', ownedLeads + ownedContacts + ownedFollowUps, 'UNLINKED', 'They become unassigned.'),
      group('reviewedWork', 'Records they reviewed or approved', reviewedWork, 'UNLINKED', 'Kept; the reviewer name is cleared.'),
      group('recruitmentWork', 'Jobs, interviews and offers they handled', recruitmentWork, 'UNLINKED', 'Kept; their name is cleared.'),
      group('createdUsers', 'Accounts they created', createdUsers, 'UNLINKED'),
      ...(selfOrOwner ? [group('protected', selfOrOwner.replace(/\.$/, ''), 1, 'BLOCKS')] : []),
      group('listingHistory', 'Listings with a sale or payment', listings.historyCount, 'BLOCKS'),
      group('payments', 'Website payments', payments, 'BLOCKS', 'Money records are never deleted.'),
      group('prime', 'Prime subscriptions', primeSubscriptions, 'BLOCKS'),
      group('wonDeals', 'Won deals (sales history)', leads.wonCount, 'BLOCKS'),
      group('agreements', 'Signed partner agreements', agreements, 'BLOCKS'),
      ...partnerGroups.filter((item) => item.action === 'BLOCKS'),
      group('verifications', 'Paid verification and API records', verificationRecords, 'BLOCKS'),
      group('auditLogs', 'Audit history of their actions', auditLogs + kycReviewHistory, 'BLOCKS'),
      group('recruitmentNotes', 'Recruitment notes, ratings and feedback they wrote', recruitmentNotes, 'BLOCKS'),
      group('financeParties', 'Finance Hub party (accounts)', financeParties, 'BLOCKS'),
    ],
  );
  return { target, profileId, listings, leads, impact };
};

export const getAccountDeletionImpact = async (userId: string, viewer: AccountDeletionViewer) =>
  (await buildAccountImpact(prisma, userId, viewer))?.impact || null;

export const deleteAccountPermanently = async (
  userId: string,
  viewer: AccountDeletionViewer,
  request: { include?: unknown; confirmation?: unknown; reason?: unknown },
) => {
  // The impact is worked out on the pool (its ~40 counts run in parallel, which one transaction
  // connection cannot do). Anything that appears in between is still caught: every BLOCKS record
  // except Finance Hub links is a restrict foreign key, and listings are re-checked one by one below.
  const built = await buildAccountImpact(prisma, userId, viewer);
  if (!built) return null;
  const { target, profileId, listings, leads, impact } = built;
  if (!impact.viewerCanDelete) throw new DeletionBlockedError(impact.viewerDeleteNote || 'You cannot delete this account.', impact);
  const { reason, include } = assertDeleteRequest(impact, request, { requireReason: true });

  const result = await prisma.$transaction(async (tx) => {
    const t = anyDb(tx);

    // Leads first: the listings below then only have other people's enquiries to unlink.
    if (leads.deletableIds.length) await tx.lead.deleteMany({ where: { id: { in: leads.deletableIds } } });
    const mediaUrls = await removeListingsInTx(tx, listings.deletableIds);
    await t.partnerTeamMember.deleteMany({ where: { userId } });

    if (profileId) {
      await t.partnerTeamMember.deleteMany({ where: { partnerProfileId: profileId } });
      await t.kycReviewLog.deleteMany({ where: { partnerProfileId: profileId } });
      await t.kycDocument.deleteMany({ where: { partnerProfileId: profileId } });
      await t.partnerDeposit.deleteMany({ where: { partnerProfileId: profileId, status: { in: DELETABLE_DEPOSIT_STATUSES } } });
      await t.category.deleteMany({ where: { partnerProfileId: profileId } });
      await t.partnerProfile.delete({ where: { id: profileId } });
    }

    await t.mobileOtpChallenge.deleteMany({ where: { userId } });
    await t.emailOtpChallenge.deleteMany({ where: { userId } });
    await t.notification.deleteMany({ where: { userId } });
    await t.adminPermission.deleteMany({ where: { adminUserId: userId } });
    await t.adminProfile.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });

    await tx.auditLog.create({
      data: {
        actorUserId: viewer.id,
        entityType: profileId ? 'PARTNER_PROFILE' : 'USER',
        entityId: profileId || userId,
        action: 'ACCOUNT_PERMANENTLY_DELETED',
        beforeJson: {
          userId,
          name: target.name,
          email: target.email,
          mobile: target.mobile,
          role: target.role,
          businessName: target.partnerProfile?.businessName || null,
          reason,
          removed: Object.fromEntries(impact.groups.map((item) => [item.key, { count: item.count, action: item.action, ...(item.action === 'OPTIONAL' ? { chosen: include.has(item.key) } : {}) }])),
        },
      },
    });
    return { mediaUrls: include.has('listingFiles') ? mediaUrls : [], entityType: impact.entityType };
  }, { maxWait: 10_000, timeout: 60_000 });
  if (!result) return null;
  await removeListingMediaFiles(result.mediaUrls);
  return result;
};
