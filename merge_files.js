const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

// Get the merge base between HEAD and origin/main
// Actually, since HEAD currently is the merge commit, the local branch before merge was HEAD^1 (which is 3de4752^1).
// The remote branch is origin/main.
// So merge base is: git merge-base 3de4752~1 origin/main
let mergeBase;
try {
  mergeBase = execSync('git merge-base 3de4752~1 origin/main', { encoding: 'utf8' }).trim();
} catch (e) {
  console.error("Failed to find merge base", e);
  process.exit(1);
}

for (const file of files) {
  try {
    console.log(`Processing ${file}...`);
    // Extract base, remote, local
    execSync(`git show ${mergeBase}:"${file}" > "${file}.base"`);
    execSync(`git show origin/main:"${file}" > "${file}.remote"`);
    // Local is the file currently in the working directory, which is the user's version since I ran git checkout --ours during the merge.
    
    // Run git merge-file
    // git merge-file <current-file> <base-file> <other-file>
    try {
      execSync(`git merge-file "${file}" "${file}.base" "${file}.remote"`);
      console.log(`Successfully auto-merged ${file}`);
    } catch (mergeError) {
      // git merge-file returns non-zero if there are conflicts.
      console.log(`Conflicts found in ${file}. Conflict markers added.`);
    }

    // Clean up temp files
    fs.unlinkSync(`${file}.base`);
    fs.unlinkSync(`${file}.remote`);
  } catch (e) {
    console.log(`Error processing ${file}: ${e.message}`);
  }
}
