import sys

with open('src/controllers/admin.controller.ts', 'r', encoding='utf8') as f:
    content = f.read()

content = content.replace(
    "const [enquiriesCount, verificationsCount, visitorsCount, recurrenceCount, listingsPendingApprovalCount] = await Promise.all([",
    "const [enquiriesCount, verificationsCount, visitorsCount, recurrenceCount, listingsPendingApprovalCount, recruitmentApplicationsCount, recruitmentInterviewsCount] = await Promise.all(["
)

content = content.replace(
    """      (prisma as any).listing.count({
        where: {
          status: {
            in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'],
          },
        },
      }),
    ]);""",
    """      (prisma as any).listing.count({
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
    ]);"""
)

content = content.replace(
    """      badges: {
        enquiries: enquiriesCount,
        verifications: verificationsCount,
        visitors: visitorsCount,
        recurrence: recurrenceCount,
        listingsPendingApproval: listingsPendingApprovalCount,
      },""",
    """      badges: {
        enquiries: enquiriesCount,
        verifications: verificationsCount,
        visitors: visitorsCount,
        recurrence: recurrenceCount,
        listingsPendingApproval: listingsPendingApprovalCount,
        recruitmentApplications: recruitmentApplicationsCount,
        recruitmentInterviews: recruitmentInterviewsCount,
      },"""
)

with open('src/controllers/admin.controller.ts', 'w', encoding='utf8') as f:
    f.write(content)
