const fs = require('fs');

function removeModalFromFile(path, routePrefix) {
    let content = fs.readFileSync(path, 'utf8');

    // Replace the "viewListing" state declaration
    content = content.replace(/const \[viewListing, setViewListing\] = useState<ListingRecord \| null>\(null\);\n?/g, '');

    // Replace the View button
    const buttonRegex = /<button[^>]*onClick=\{\(\) => setViewListing\(listing\)\}[^>]*>([\s\S]*?)<\/button>/g;
    const replacement = `<Link href={\`${routePrefix}/\${listing.id}\`} className="rounded-lg p-2 text-gray-500 transition hover:bg-blue-50 hover:text-blue-600" title="View details">$1</Link>`;
    content = content.replace(buttonRegex, replacement);

    // Remove the modal block at the bottom
    // We will use a regex that handles the block {viewListing ? ( ... ) : null}
    // Since it spans many lines, we match everything from {viewListing ? ( up to the last ) : null}
    const modalRegex = /\{viewListing \? \(\s*<div className="fixed inset-0[^>]*>[\s\S]*?\)\s*:\s*null\}/g;
    content = content.replace(modalRegex, '');

    // The script might leave <Link> tag missing an import.
    if (!content.includes("import Link from 'next/link';")) {
        content = content.replace(/import Image from 'next\/image';/, "import Image from 'next/image';\nimport Link from 'next/link';");
    }

    fs.writeFileSync(path, content, 'utf8');
    console.log(`Removed modal from ${path}`);
}

removeModalFromFile(
    "admin-portal/src/app/(admin)/superadmin/listings/page.tsx",
    "/superadmin/listings"
);
removeModalFromFile(
    "admin-portal/src/app/(partner)/partner/listings/page.tsx",
    "/partner/listings"
);
