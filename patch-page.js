const fs = require('fs');

const pageFile = 'frontend/src/app/page.tsx';
let content = fs.readFileSync(pageFile, 'utf8');

// 1. Add FeaturedJobItem type
const featuredJobItemType = `
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
if (!content.includes('type FeaturedJobItem')) {
  content = content.replace(
    "const getListingStatusBadge =",
    featuredJobItemType + "\nconst getListingStatusBadge ="
  );
}

// 2. Add state
if (!content.includes('const [featuredJobs, setFeaturedJobs]')) {
  content = content.replace(
    "  const [searchLocations, setSearchLocations] = React.useState<PublicSearchLocation[]>([]);",
    "  const [searchLocations, setSearchLocations] = React.useState<PublicSearchLocation[]>([]);\n  const [featuredJobs, setFeaturedJobs] = React.useState<FeaturedJobItem[]>([]);"
  );
}

// 3. Add API call for featured jobs
if (!content.includes('/recruitment/public/jobs?limit=4')) {
  content = content.replace(
    "api.get<{ success: boolean; data: Record<string, any> }>('/master/finance-support').catch(() => null),",
    "api.get<{ success: boolean; data: Record<string, any> }>('/master/finance-support').catch(() => null),\n          api.get<{ success: boolean; jobs: FeaturedJobItem[] }>('/recruitment/public/jobs?limit=4').catch(() => null),"
  );
  content = content.replace(
    "setFinanceSupportItems(financeRes.data.data || []);\n        } else {\n          setFinanceSupportItems([]);\n        }",
    "setFinanceSupportItems(financeRes.data.data || []);\n        } else {\n          setFinanceSupportItems([]);\n        }\n\n        const jobsRes = results[3] as any;\n        if (jobsRes?.data?.success) {\n          setFeaturedJobs(jobsRes.data.jobs || []);\n        }"
  );
}

// 4. Extract Careers section from remote
const remoteFile = fs.readFileSync('page_remote.tsx', 'utf8');
const careersMatch = remoteFile.match(/\{\/\* 6\. CAREERS & OPEN POSITIONS SECTION \*\/\}([\s\S]*?)<\/section>/);
const careersSection = careersMatch ? careersMatch[0] : '';

// 5. Insert Careers section
if (!content.includes('6. CAREERS & OPEN POSITIONS SECTION') && careersSection) {
  content = content.replace(
    "      </div>\n    </div>\n  );\n}",
    "      </div>\n\n      " + careersSection + "\n\n    </div>\n  );\n}"
  );
}

// Ensure Briefcase is imported
if (!content.includes('Briefcase')) {
  content = content.replace(
    "} from 'lucide-react';",
    ", Briefcase } from 'lucide-react';"
  );
}

fs.writeFileSync(pageFile, content);
console.log('Patched page.tsx');
