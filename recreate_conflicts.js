const { execSync } = require('child_process');

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

for (const file of files) {
  try {
    execSync(`git checkout -m 3de4752~1 -- "${file}"`);
    console.log(`Recreated conflict in ${file}`);
  } catch (e) {
    console.log(`Conflict recreated with error (expected) in ${file}`);
  }
}
