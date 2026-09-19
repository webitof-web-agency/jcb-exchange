const fs = require('fs');

const originContent = fs.readFileSync('origin_page.tsx', 'utf8');
let localContent = fs.readFileSync('frontend/src/app/page.tsx', 'utf8');

// 1. Fix imports
localContent = localContent.replace(
  "import { Search, MapPin, ChevronDown, ArrowRight, Package, Truck, Coins, FileText, Handshake } from 'lucide-react';",
  "import { Search, MapPin, ChevronDown, ArrowRight, Package, Truck, Coins, FileText, Handshake, Briefcase, Sparkles, Building2, Users } from 'lucide-react';"
);

// 2. Add Type
const typeToAdd = `
type FeaturedJobItem = {
  id: string;
  title: string;
  slug: string;
  locationCity: string;
  locationState: string;
  employmentType: string;
  workMode: string;
  vacancies: number;
  department?: { name: string };
};
`;
localContent = localContent.replace(
  "type PublicSearchFilters = {\n  categories: PublicCategory[];\n  locations: PublicSearchLocation[];\n};\n",
  "type PublicSearchFilters = {\n  categories: PublicCategory[];\n  locations: PublicSearchLocation[];\n};\n" + typeToAdd
);

// 3. Add State
localContent = localContent.replace(
  "const [appStoreLink, setAppStoreLink] = React.useState<string | null>(null);",
  "const [appStoreLink, setAppStoreLink] = React.useState<string | null>(null);\n  const [featuredJobs, setFeaturedJobs] = React.useState<FeaturedJobItem[]>([]);"
);

// 4. Update API call
localContent = localContent.replace(
  "api.get<{ success: boolean; data: any }>('/master/mobile-app').catch(() => null),\n        ]);",
  "api.get<{ success: boolean; data: any }>('/master/mobile-app').catch(() => null),\n          api.get<{ success: boolean; jobs: FeaturedJobItem[] }>('/recruitment/public/jobs?limit=4').catch(() => null),\n        ]);"
);

localContent = localContent.replace(
  "const [financeRes, heroRes, inspectionRes, categoriesRes, filtersRes, mobileAppRes] = await Promise.all([",
  "const [financeRes, heroRes, inspectionRes, categoriesRes, filtersRes, mobileAppRes, jobsRes] = await Promise.all(["
);

const stateUpdateToAdd = `
        if (jobsRes?.data?.success) {
          setFeaturedJobs(jobsRes.data.jobs || []);
        } else {
          setFeaturedJobs([]);
        }
`;
localContent = localContent.replace(
  "setAppStoreLink(mobileAppRes.data.data?.appStoreLink || null);\n        } else {\n          setPlayStoreLink(null);\n          setAppStoreLink(null);\n        }",
  "setAppStoreLink(mobileAppRes.data.data?.appStoreLink || null);\n        } else {\n          setPlayStoreLink(null);\n          setAppStoreLink(null);\n        }\n" + stateUpdateToAdd
);

localContent = localContent.replace(
  "setSearchLocations([]);\n          setPlayStoreLink(null);\n          setAppStoreLink(null);\n        }",
  "setSearchLocations([]);\n          setPlayStoreLink(null);\n          setAppStoreLink(null);\n          setFeaturedJobs([]);\n        }"
);

// 5. Extract and add JSX
const jsxStartMarker = "{/* 6. CAREERS & OPEN POSITIONS SECTION */}";
const startIndex = originContent.indexOf(jsxStartMarker);
const endIndex = originContent.lastIndexOf("</div>\n    );\n  }");

if (startIndex !== -1 && endIndex !== -1) {
  const jsxBlock = originContent.substring(startIndex, endIndex);
  
  // Find where to insert it in localContent
  const localInsertPoint = localContent.lastIndexOf("</section>\n\n    </div>\n  );\n}");
  if (localInsertPoint !== -1) {
    localContent = localContent.substring(0, localInsertPoint + 10) + "\n\n      " + jsxBlock + localContent.substring(localInsertPoint + 10);
  }
}

fs.writeFileSync('frontend/src/app/page.tsx', localContent);
console.log('Fixed page.tsx');
