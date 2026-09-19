export interface RecruitmentStage {
  id?: string;
  name: string;
  code: string;
  order: number;
  color?: string | null;
  isSystem?: boolean;
  isTerminal?: boolean;
  usageCount?: number;
}

export const DEFAULT_RECRUITMENT_STAGES: RecruitmentStage[] = [
  { name: 'New', code: 'NEW', order: 1, color: 'blue', isSystem: false, isTerminal: false },
  { name: 'Under Review', code: 'UNDER_REVIEW', order: 2, color: 'amber', isSystem: false, isTerminal: false },
  { name: 'Shortlisted', code: 'SHORTLISTED', order: 3, color: 'purple', isSystem: false, isTerminal: false },
  { name: 'Contacted', code: 'CONTACTED', order: 4, color: 'indigo', isSystem: false, isTerminal: false },
  { name: 'Interview Scheduled', code: 'INTERVIEW_SCHEDULED', order: 5, color: 'cyan', isSystem: false, isTerminal: false },
  { name: 'Interview Completed', code: 'INTERVIEW_COMPLETED', order: 6, color: 'teal', isSystem: false, isTerminal: false },
  { name: 'Selected', code: 'SELECTED', order: 7, color: 'emerald', isSystem: false, isTerminal: false },
  { name: 'Offer Prepared', code: 'OFFER_PREPARED', order: 8, color: 'orange', isSystem: false, isTerminal: false },
  { name: 'Offer Sent', code: 'OFFER_SENT', order: 9, color: 'pink', isSystem: false, isTerminal: false },
  { name: 'Offer Accepted', code: 'OFFER_ACCEPTED', order: 10, color: 'lime', isSystem: false, isTerminal: false },
  { name: 'Hired', code: 'HIRED', order: 11, color: 'green', isSystem: false, isTerminal: true },
];

const STAGE_TONES: Record<string, { dot: string; border: string; pill: string; soft: string }> = {
  blue: { dot: 'bg-blue-500', border: 'border-blue-200', pill: 'bg-blue-50 text-blue-800 border-blue-200', soft: 'bg-blue-50 text-blue-800' },
  amber: { dot: 'bg-amber-500', border: 'border-amber-200', pill: 'bg-amber-50 text-amber-900 border-amber-200', soft: 'bg-amber-50 text-amber-900' },
  purple: { dot: 'bg-purple-500', border: 'border-purple-200', pill: 'bg-purple-50 text-purple-800 border-purple-200', soft: 'bg-purple-50 text-purple-800' },
  indigo: { dot: 'bg-indigo-500', border: 'border-indigo-200', pill: 'bg-indigo-50 text-indigo-800 border-indigo-200', soft: 'bg-indigo-50 text-indigo-800' },
  cyan: { dot: 'bg-cyan-500', border: 'border-cyan-200', pill: 'bg-cyan-50 text-cyan-800 border-cyan-200', soft: 'bg-cyan-50 text-cyan-800' },
  teal: { dot: 'bg-teal-500', border: 'border-teal-200', pill: 'bg-teal-50 text-teal-800 border-teal-200', soft: 'bg-teal-50 text-teal-800' },
  emerald: { dot: 'bg-emerald-500', border: 'border-emerald-200', pill: 'bg-emerald-50 text-emerald-800 border-emerald-200', soft: 'bg-emerald-50 text-emerald-800' },
  orange: { dot: 'bg-orange-500', border: 'border-orange-200', pill: 'bg-orange-50 text-orange-800 border-orange-200', soft: 'bg-orange-50 text-orange-800' },
  pink: { dot: 'bg-pink-500', border: 'border-pink-200', pill: 'bg-pink-50 text-pink-800 border-pink-200', soft: 'bg-pink-50 text-pink-800' },
  lime: { dot: 'bg-lime-600', border: 'border-lime-200', pill: 'bg-lime-50 text-lime-800 border-lime-200', soft: 'bg-lime-50 text-lime-800' },
  green: { dot: 'bg-green-600', border: 'border-green-200', pill: 'bg-green-50 text-green-800 border-green-200', soft: 'bg-green-50 text-green-800' },
  violet: { dot: 'bg-violet-500', border: 'border-violet-200', pill: 'bg-violet-50 text-violet-800 border-violet-200', soft: 'bg-violet-50 text-violet-800' },
  rose: { dot: 'bg-rose-500', border: 'border-rose-200', pill: 'bg-rose-50 text-rose-800 border-rose-200', soft: 'bg-rose-50 text-rose-800' },
  red: { dot: 'bg-red-500', border: 'border-red-200', pill: 'bg-red-50 text-red-800 border-red-200', soft: 'bg-red-50 text-red-800' },
  gray: { dot: 'bg-gray-500', border: 'border-gray-200', pill: 'bg-gray-50 text-gray-800 border-gray-200', soft: 'bg-gray-50 text-gray-800' },
};

export const formatRecruitmentStageLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const getRecruitmentStageTone = (color?: string | null) => {
  const normalized = (color || 'gray').toLowerCase();
  return STAGE_TONES[normalized] || STAGE_TONES.gray;
};

export const sortRecruitmentStages = (stages: RecruitmentStage[]) =>
  [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

export const normalizeRecruitmentStages = (stages?: RecruitmentStage[] | null) => {
  // Missing data means the API did not provide stages; an empty array is a valid
  // persisted state after an administrator deletes every unused stage.
  const list = stages ?? DEFAULT_RECRUITMENT_STAGES;
  return sortRecruitmentStages(list);
};

export const getRecruitmentStageByCode = (stages: RecruitmentStage[], code: string) =>
  stages.find((stage) => stage.code === code) || null;
