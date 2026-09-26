const fs = require('fs');
let content = fs.readFileSync('src/controllers/admin.controller.ts', 'utf8');

content = content.replace(
    'const [enquiriesCount, verificationsCount, visitorsCount, recurrenceCount, listingsPendingApprovalCount] = await Promise.all([',
    'const [enquiriesCount, verificationsCount, visitorsCount, recurrenceCount, listingsPendingApprovalCount, recruitmentApplicationsCount, recruitmentInterviewsCount] = await Promise.all(['
);

content = content.replace(
    `      (prisma as any).listing.count({
        where: {
          status: {
            in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'],
          },
        },
      }),
    ]);`,
    `      (prisma as any).listing.count({
        where: {
          status: {
            in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'],
          },
        },
      }),
      (prisma as any).jobApplication.count({
        where: { currentStage: 'NEW' },
      }),
      (prisma as any).interview.count({
        where: { status: 'SCHEDULED' },
      }),
    ]);`
);

content = content.replace(
    `      badges: {
        enquiries: enquiriesCount,
        verifications: verificationsCount,
        visitors: visitorsCount,
        recurrence: recurrenceCount,
        listingsPendingApproval: listingsPendingApprovalCount,
      },`,
    `      badges: {
        enquiries: enquiriesCount,
        verifications: verificationsCount,
        visitors: visitorsCount,
        recurrence: recurrenceCount,
        listingsPendingApproval: listingsPendingApprovalCount,
        recruitmentApplications: recruitmentApplicationsCount,
        recruitmentInterviews: recruitmentInterviewsCount,
      },`
);

fs.writeFileSync('src/controllers/admin.controller.ts', content, 'utf8');
