const fs = require('fs');

function removeModalFromFile(path) {
    let content = fs.readFileSync(path, 'utf8');

    // Remove setViewListing from handleDeleteListing success block
    content = content.replace(/if\s*\(viewListing\?.id\s*===\s*deleteListingRecord\.id\)\s*\{\s*setViewListing\(null\);\s*\}/g, '');

    // Remove setViewListing from handleUpdateAvailability
    content = content.replace(/setViewListing\(\(current\)\s*=>\s*\(current\?.id\s*===\s*listingId\s*\?\s*\{\s*\.\.\.current,\s*status:\s*optimisticStatus\s*\}\s*:\s*current\)\);/g, '');
    content = content.replace(/setViewListing\(\(current\)\s*=>\s*\(current\?.id\s*===\s*listingId\s*\?\s*response\.data\.listing\s*:\s*current\)\);/g, '');
    content = content.replace(/setViewListing\(\(current\)\s*=>\s*\(current\?.id\s*===\s*listingId\s*\?\s*previousListing\s*:\s*current\)\);/g, '');
    
    // Fallbacks just in case
    content = content.replace(/setViewListing\(.*?\);/g, '');
    content = content.replace(/if\s*\(viewListing.*?\)\s*\{\s*.*\s*\}/g, '');

    fs.writeFileSync(path, content, 'utf8');
    console.log(`Removed remaining setViewListing references from ${path}`);
}

removeModalFromFile("admin-portal/src/app/(admin)/superadmin/listings/page.tsx");
removeModalFromFile("admin-portal/src/app/(partner)/partner/listings/page.tsx");
