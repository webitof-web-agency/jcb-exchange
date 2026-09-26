const fs = require('fs');
let content = fs.readFileSync('src/controllers/admin.controller.ts', 'utf8');

// Replace queries array end
content = content.replace(/status: {\s*in: \['PENDING_APPROVAL', 'CHANGES_REQUESTED'\],\s*},\s*},\s*}[^\]]*\],\s*\]\);/g,
`status: {
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
    ]);`);

// Replace badges object
content = content.replace(/listingsPendingApproval: listingsPendingApprovalCount,[\s\n]*}/g,
`listingsPendingApproval: listingsPendingApprovalCount,
        recruitmentApplications: recruitmentApplicationsCount,
        recruitmentInterviews: recruitmentInterviewsCount,
      }`);

fs.writeFileSync('src/controllers/admin.controller.ts', content, 'utf8');
