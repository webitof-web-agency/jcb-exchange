const fs = require('fs');
const execSync = require('child_process').execSync;

execSync('git show origin/main:frontend/src/app/page.tsx > temp_page_remote.tsx');
const remoteContent = fs.readFileSync('temp_page_remote.tsx', 'utf8');

// Extract SEO section
const seoMatch = remoteContent.match(/\{\/\* 2\.75 SEARCH-FRIENDLY SERVICE SUMMARY \*\/\}([\s\S]*?)<\/section>/);
let seoSection = seoMatch ? seoMatch[0] : '';
if (seoSection) {
  // Hide on mobile
  seoSection = seoSection.replace('<section className="w-full border-y', '<section className="hidden md:block w-full border-y');
}

// Extract Careers section
const careersMatch = remoteContent.match(/\{\/\* 6\. CAREERS & OPEN POSITIONS SECTION \*\/\}([\s\S]*?)<\/section>/);
let careersSection = careersMatch ? careersMatch[0] : '';
if (careersSection) {
  // Hide on mobile
  careersSection = careersSection.replace('<section className="py-8 sm:py-10', '<section className="hidden md:block py-8 sm:py-10');
}

let localContent = fs.readFileSync('frontend/src/app/page.tsx', 'utf8');

// Insert SEO section before section 3 (RECENT SOLD MACHINES) or section 4 (FINANCE & SERVICES)
if (seoSection && !localContent.includes('SEARCH-FRIENDLY SERVICE SUMMARY')) {
  if (localContent.includes('{/* 3. RECENT SOLD MACHINES */}')) {
    localContent = localContent.replace(
      "{/* 3. RECENT SOLD MACHINES */}",
      seoSection + "\n\n      {/* 3. RECENT SOLD MACHINES */}"
    );
  } else if (localContent.includes('{/* 4. FINANCE & SERVICES */}')) {
    localContent = localContent.replace(
      "{/* 4. FINANCE & SERVICES */}",
      seoSection + "\n\n      {/* 4. FINANCE & SERVICES */}"
    );
  }
}

// Insert Careers section at the very end before the last closing div
if (careersSection && !localContent.includes('CAREERS & OPEN POSITIONS SECTION')) {
  // Find the last </div>\n    </div>\n  );\n}
  localContent = localContent.replace(
    "      </div>\n    </div>\n  );\n}",
    "      </div>\n\n      " + careersSection + "\n\n    </div>\n  );\n}"
  );
  // Backup if it's slightly different
  if (localContent === fs.readFileSync('frontend/src/app/page.tsx', 'utf8')) {
    const lastClosingTagsIndex = localContent.lastIndexOf('    </div>');
    if (lastClosingTagsIndex !== -1) {
      localContent = localContent.slice(0, lastClosingTagsIndex) + "\n      " + careersSection + "\n\n" + localContent.slice(lastClosingTagsIndex);
    }
  }
}

// Write it back
fs.writeFileSync('frontend/src/app/page.tsx', localContent);
console.log('Successfully injected Careers and SEO sections with hidden md:block.');
