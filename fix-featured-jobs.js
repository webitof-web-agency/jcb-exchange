const fs = require('fs');

const file = 'frontend/src/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('setFeaturedJobs(jobsRes')) {
  const setLogic = `
        if (jobsRes?.data?.success) {
          setFeaturedJobs(jobsRes.data.jobs || []);
        } else {
          setFeaturedJobs([]);
        }
`;
  content = content.replace(
    'if (mobileAppRes?.data?.success) {',
    setLogic + '\n        if (mobileAppRes?.data?.success) {'
  );
  fs.writeFileSync(file, content);
  console.log('Injected setFeaturedJobs successfully!');
} else {
  console.log('Already injected.');
}
