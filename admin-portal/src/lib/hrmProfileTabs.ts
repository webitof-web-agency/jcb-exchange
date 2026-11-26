import type { HrmChecklistItem } from './hrmApi';
import { CHECKLIST_TARGET } from './hrmProfile';

/** The employee profile's sections: which exist, which a viewer sees, and where each joining item is completed. */

export type ProfileTab = 'overview' | 'personal' | 'job' | 'kyc' | 'documents' | 'salary' | 'shift' | 'attendance' | 'leave' | 'performance' | 'exit' | 'access';

export const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'personal', label: 'Personal' },
  { id: 'job', label: 'Job' },
  { id: 'kyc', label: 'KYC & Bank' },
  { id: 'documents', label: 'Documents' },
  { id: 'salary', label: 'Salary' },
  { id: 'shift', label: 'Shift' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'leave', label: 'Leave' },
  { id: 'performance', label: 'Performance' },
  { id: 'exit', label: 'Exit' },
  { id: 'access', label: 'Login & access' },
];

/** The tab a link asks for (?tab=, or the older ?module= with "compensation" for salary). */
export const readProfileTab = (value: string | null | undefined): ProfileTab => {
  if (value === 'compensation') return 'salary';
  return PROFILE_TABS.find((tab) => tab.id === value)?.id ?? 'overview';
};

/** Somebody who has not started yet has no attendance, leave, performance or exit records. */
const NOT_STARTED = new Set(['DRAFT', 'PRE_ONBOARDING']);

export type ProfileTabAccess = {
  documentsVisible: boolean;
  tabs: { kyc: boolean; attendance: boolean; leave: boolean; compensation: boolean; performance: boolean; exit: boolean };
  read: { salary: boolean; shift: boolean };
};

/** Lists that already hold records: somebody hired again keeps seeing their history before joining. */
export type ProfileHistory = Partial<Record<'attendance' | 'leave' | 'performance' | 'exit', boolean>>;

export const visibleProfileTabs = (status: string, access: ProfileTabAccess, history: ProfileHistory = {}) => {
  const started = !NOT_STARTED.has(status);
  const shown: Record<ProfileTab, boolean> = {
    overview: true,
    personal: true,
    job: true,
    kyc: access.tabs.kyc,
    documents: access.documentsVisible,
    salary: access.read.salary || access.tabs.compensation,
    shift: access.read.shift,
    attendance: (started || Boolean(history.attendance)) && access.tabs.attendance,
    leave: (started || Boolean(history.leave)) && access.tabs.leave,
    performance: (started || Boolean(history.performance)) && access.tabs.performance,
    exit: (started || Boolean(history.exit)) && access.tabs.exit,
    access: true,
  };
  return PROFILE_TABS.filter((tab) => shown[tab.id]);
};

const CARD_TABS: Record<(typeof CHECKLIST_TARGET)[string]['card'], ProfileTab> = {
  personal: 'personal',
  assignment: 'job',
  kyc: 'kyc',
  documents: 'documents',
  salary: 'salary',
  shift: 'shift',
  login: 'access',
};

/** The tab where a joining checklist item is completed; null for an unknown item. */
export const checklistTab = (key: string): ProfileTab | null => {
  const target = CHECKLIST_TARGET[key];
  return target ? CARD_TABS[target.card] : null;
};

const isOpen = (item: HrmChecklistItem) => item.required && item.counted && item.state !== 'DONE';

/** How many required joining items are still open on each tab. */
export const openItemsByTab = (checklist: readonly HrmChecklistItem[]) => {
  const counts: Partial<Record<ProfileTab, number>> = {};
  for (const item of checklist) {
    const tab = isOpen(item) ? checklistTab(item.key) : null;
    if (tab) counts[tab] = (counts[tab] ?? 0) + 1;
  }
  return counts;
};

/**
 * What the button on a joining item does: "Complete" (open it with its form), "Review" (waiting for somebody to verify
 * or approve), "View" (done, or the viewer cannot change it); null when the viewer cannot open that part at all.
 */
export const checklistAction = (item: HrmChecklistItem, can: { open: boolean; complete: boolean }): 'Complete' | 'Review' | 'View' | null => {
  if (!can.open) return null;
  if (item.state === 'MISSING' && can.complete) return 'Complete';
  return item.state === 'PENDING' ? 'Review' : 'View';
};

/** The next item still missing that the viewer can complete, after this one (starting again from the top). */
export const nextOpenItem = (checklist: readonly HrmChecklistItem[], currentKey: string, canComplete: (item: HrmChecklistItem) => boolean) => {
  const index = checklist.findIndex((item) => item.key === currentKey);
  const ordered = [...checklist.slice(index + 1), ...checklist.slice(0, Math.max(index, 0))];
  return ordered.find((item) => item.key !== currentKey && item.required && item.counted && item.state === 'MISSING' && canComplete(item)) ?? null;
};
