const fs = require('fs');

const remoteContent = fs.readFileSync('temp_page_remote.tsx', 'utf8');

// Extract SEO section
const seoMatch = remoteContent.match(/\{\/\* 2\.75 SEARCH-FRIENDLY SERVICE SUMMARY \*\/\}([\s\S]*?)<\/section>/);
let seoSection = seoMatch ? seoMatch[0] : '';
if (seoSection) {
  // Hide on mobile
  seoSection = seoSection.replace('<section className="w-full border-y', '<section className="hidden md:block w-full border-y');
}

let localContent = fs.readFileSync('frontend/src/app/page.tsx', 'utf8');

if (seoSection && !localContent.includes('SEARCH-FRIENDLY SERVICE SUMMARY')) {
  localContent = localContent.replace(
    "{/* 5. CERTIFIED & INSPECTED BY EXPERTS */}",
    seoSection + "\n\n      {/* 5. CERTIFIED & INSPECTED BY EXPERTS */}"
  );
  fs.writeFileSync('frontend/src/app/page.tsx', localContent);
  console.log('Successfully injected SEO section with hidden md:block.');
}
