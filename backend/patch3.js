const fs = require('fs');
let content = fs.readFileSync('src/controllers/admin.controller.ts', 'utf8');

const target1 = `      (prisma as any).listing.count({
        where: {
          status: {
            in: ['PENDING_APPROVAL', 'CHANGES_REQUESTED'],
          },
        },
      }),
    ]);`;

const rep1 = `      (prisma as any).listing.count({
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
    ]);`;

// handle \r\n vs \n
let c2 = content.replace(target1.replace(/\n/g, '\r\n'), rep1.replace(/\n/g, '\r\n'));
if(c2 === content) {
   c2 = content.replace(target1, rep1);
}
content = c2;
fs.writeFileSync('src/controllers/admin.controller.ts', content, 'utf8');
