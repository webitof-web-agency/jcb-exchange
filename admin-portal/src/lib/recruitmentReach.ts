/**
 * Which states the signed-in person sees in recruitment (GET /recruitment/admin/reach). The server limits every list
 * and action; the screens only say what they are showing and hide choices that would be refused.
 */

export type RecruitmentReachInfo = {
  allIndia: boolean;
  headOffice: boolean;
  states: Array<{ id: number; name: string }>;
};

/** The banner above the recruitment pages; null for an all-India viewer. */
export const describeRecruitmentReach = (reach: RecruitmentReachInfo | null): { tone: 'info' | 'warning'; text: string } | null => {
  if (!reach || reach.allIndia) return null;
  const places = [...reach.states.map((state) => state.name), ...(reach.headOffice ? ['Head office postings'] : [])];
  if (!places.length) {
    return {
      tone: 'warning',
      text: 'You have no state access yet, so recruitment shows nothing except the interviews you take. Ask HR to give you access (HRM → your profile → Access).',
    };
  }
  return { tone: 'info', text: `You are seeing recruitment for: ${places.join(', ')}. Company-wide settings are view only.` };
};

/** The states a job form offers: every state for an all-India viewer (and one that covers the head office). */
export const jobStatesFor = <T extends { id: number }>(states: readonly T[], reach: RecruitmentReachInfo | null) => {
  if (!reach || reach.allIndia || reach.headOffice) return [...states];
  const mine = new Set(reach.states.map((state) => state.id));
  return states.filter((state) => mine.has(state.id));
};

export const JOB_POSTING_OPTIONS: ReadonlyArray<{ value: '' | 'STATE_OFFICE' | 'HEAD_OFFICE'; label: string }> = [
  { value: '', label: 'Automatic (head office in its own city)' },
  { value: 'STATE_OFFICE', label: 'State office' },
  { value: 'HEAD_OFFICE', label: 'Head office' },
];

export const jobPostingOptionsFor = (reach: RecruitmentReachInfo | null) => {
  if (!reach || reach.allIndia) return [...JOB_POSTING_OPTIONS];
  return JOB_POSTING_OPTIONS.filter((option) => option.value === ''
    || (option.value === 'HEAD_OFFICE' ? reach.headOffice : reach.states.length > 0));
};
