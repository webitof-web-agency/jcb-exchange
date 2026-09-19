const { execSync } = require('child_process');
const fs = require('fs');

const files = [
  'JCB-Exchange/src/config/devNetwork.js',
  'admin-portal/src/app/(admin)/superadmin/settings/page.tsx',
  'backend/src/controllers/admin.controller.ts',
  'backend/src/controllers/master.controller.ts',
  'backend/src/utils/appSettings.ts',
  'frontend/src/app/globals.css',
  'frontend/src/app/layout.tsx',
  'frontend/src/app/machines/MachinesPageClient.tsx',
  'frontend/src/app/machines/[id]/MachineDetailClient.tsx',
  'frontend/src/app/page.tsx',
  'frontend/src/app/profile/ProfilePageClient.tsx',
  'frontend/src/components/layout/Footer.tsx',
  'frontend/src/components/layout/Navbar.tsx',
  'frontend/src/components/profile/MyListingsTab.tsx'
];

let report = '# Diff Report: origin/main vs HEAD\n\n';

for (const file of files) {
  try {
    const diff = execSync(`git diff origin/main HEAD -- "${file}"`, { encoding: 'utf-8' });
    if (diff.trim()) {
      report += `## ${file}\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;
    } else {
      report += `## ${file}\n(No differences)\n\n`;
    }
  } catch (e) {
    report += `## ${file}\n(Error getting diff: ${e.message})\n\n`;
  }
}

fs.writeFileSync('diff_report.md', report);
console.log('Diff report generated at diff_report.md');
