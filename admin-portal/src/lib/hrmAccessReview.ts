import type { HrmAccessIssue, HrmAccessPerson, HrmAccessReviewQuery, HrmAccessSeverity } from './hrmApi';

/** Labels and links of the access review page (no React, so they are tested). */

export const SEVERITY_LABELS: Record<HrmAccessSeverity, { label: string; tone: string }> = {
  HIGH: { label: 'High', tone: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
  MEDIUM: { label: 'Medium', tone: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  LOW: { label: 'Low', tone: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
};

/** Where an issue is fixed: the person's profile (access card), the office or the job. */
export const issueLink = (issue: Pick<HrmAccessIssue, 'code' | 'person' | 'office' | 'jobId'>, portal: 'admin' | 'employee') => {
  // The jobs list opens the edit form of this job (the detail page has no place fields).
  if (issue.jobId) return { href: `/${portal}/recruitment/jobs?edit=${encodeURIComponent(issue.jobId)}`, label: 'Edit job' };
  if (issue.code === 'VACANT_OFFICE' || issue.code === 'CHARGE_ENDING') {
    if (issue.office) return { href: `/${portal}/hrm/organisation/offices/${encodeURIComponent(issue.office.id)}`, label: 'Open office' };
  }
  if (issue.person?.employeeId) return { href: `/${portal}/hrm/${encodeURIComponent(issue.person.employeeId)}`, label: 'Open profile' };
  // A login without an HR record is changed on the Users page.
  if (issue.person) return { href: `/${portal}/users`, label: 'Open Users' };
  return issue.office ? { href: `/${portal}/hrm/organisation/offices/${encodeURIComponent(issue.office.id)}`, label: 'Open office' } : null;
};

export const describeHrmAccess = (hr: HrmAccessPerson['hr']) => {
  if (hr.allIndia) return ['All of India'];
  const parts = [
    ...hr.states.map((state) => state.name),
    ...(hr.headOffice ? ['Head office'] : []),
    ...(hr.directReports ? ['Direct reports'] : []),
    ...(hr.other ? ['Departments / teams'] : []),
  ];
  return parts.length ? parts : ['Own record only'];
};

export const RECRUITMENT_VIEW_LABELS: Record<HrmAccessPerson['recruitment'], string> = {
  ALL: 'All of India',
  STATES: 'Their states',
  NONE: 'Nothing (no state)',
  NOT_USED: '—',
};

export const toAccessReviewQuery = (filters: { view: 'issues' | 'people'; issue: string; search: string; stateId: string; page: number }): HrmAccessReviewQuery => ({
  view: filters.view,
  page: filters.page,
  limit: 25,
  ...(filters.view === 'issues' && filters.issue ? { issue: filters.issue as NonNullable<HrmAccessReviewQuery['issue']> } : {}),
  ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
  ...(filters.stateId ? { stateId: Number(filters.stateId) } : {}),
});
