const fs = require('fs');

const files = [
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
  'frontend/src/components/profile/MyListingsTab.tsx',
  'frontend/src/components/layout/Navbar.tsx',
  'frontend/src/components/layout/Footer.tsx'
];

let report = '';

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  let inConflict = false;
  let conflictBlock = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('<<<<<<<')) {
      inConflict = true;
      conflictBlock += `\n--- Conflict at line ${i + 1} ---\n`;
    }
    
    if (inConflict) {
      conflictBlock += line + '\n';
    }
    
    if (line.startsWith('>>>>>>>')) {
      inConflict = false;
    }
  }
  
  if (conflictBlock) {
    report += `\n\n========================================\n# ${file}\n========================================\n${conflictBlock}`;
  }
}

fs.writeFileSync('conflicts_report.md', report);
console.log('Saved conflicts_report.md');
