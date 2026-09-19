const fs = require('fs');

const file = 'frontend/src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add FeaturedJobItem type
const featuredJobType = `
type FeaturedJobItem = {
  id: string;
  slug: string;
  title: string;
  department: { name: string } | null;
  workMode: string;
  locationCity: string;
  locationState: string;
  employmentType: string;
  vacancies: number;
};
`;

if (!content.includes('type FeaturedJobItem =')) {
  content = content.replace(
    'type FinanceSupportItem =',
    featuredJobType + '\ntype FinanceSupportItem ='
  );
}

// 2. Add state
if (!content.includes('const [featuredJobs, setFeaturedJobs]')) {
  content = content.replace(
    'const [searchCategories, setSearchCategories] = React.useState<PublicCategory[]>([]);',
    'const [searchCategories, setSearchCategories] = React.useState<PublicCategory[]>([]);\n  const [featuredJobs, setFeaturedJobs] = React.useState<FeaturedJobItem[]>([]);'
  );
}

// 3. Add to Promise.all
if (!content.includes('/recruitment/public/jobs')) {
  content = content.replace(
    "api.get<{ success: boolean; data: any }>('/master/mobile-app').catch(() => null),",
    "api.get<{ success: boolean; data: any }>('/master/mobile-app').catch(() => null),\n            api.get<{ success: boolean; jobs: FeaturedJobItem[] }>('/recruitment/public/jobs?limit=4').catch(() => null),"
  );
  content = content.replace(
    'const [financeRes, heroRes, inspectionRes, categoriesRes, filtersRes, mobileAppRes] = await Promise.all([',
    'const [financeRes, heroRes, inspectionRes, categoriesRes, filtersRes, mobileAppRes, jobsRes] = await Promise.all(['
  );
}

// 4. Add set logic
if (!content.includes('setFeaturedJobs(jobsRes.data.jobs')) {
  const setLogic = `
        if (jobsRes?.data?.success) {
          setFeaturedJobs(jobsRes.data.jobs || []);
        } else {
          setFeaturedJobs([]);
        }
`;
  content = content.replace(
    'if (mobileAppRes?.data?.success && mobileAppRes.data.data) {',
    setLogic + '\n        if (mobileAppRes?.data?.success && mobileAppRes.data.data) {'
  );
}

fs.writeFileSync(file, content);
console.log('Patched featuredJobs logic successfully.');
