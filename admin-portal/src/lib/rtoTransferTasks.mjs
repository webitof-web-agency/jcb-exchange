// Mirrors backend/src/services/rtoTransferTasks.ts.
export const TRANSFER_TASK_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending', tone: 'slate', hint: 'Not started yet.' },
  { value: 'DOCUMENT_EXPIRED', label: 'Document expired', tone: 'rose', hint: 'Needs renewal from the 1st owner.' },
  { value: 'RENEWAL_IN_PROGRESS', label: 'Renewal in progress', tone: 'amber', hint: '1st owner is renewing the document.' },
  { value: 'TRANSFER_INITIATED', label: 'Transfer initiated', tone: 'blue', hint: 'Application filed with RTO / insurer.' },
  { value: 'ISSUE_REPORTED', label: 'Issue / error', tone: 'orange', hint: 'Name mismatch, missing document or RTO objection.' },
  { value: 'TRANSFERRED', label: 'Transferred', tone: 'emerald', hint: 'Now in the 2nd owner\'s name.' },
  { value: 'NOT_REQUIRED', label: 'Not required', tone: 'gray', hint: 'Not applicable for this vehicle.' },
];

export const TASK_TONE_CLASSES = {
  slate: 'border-slate-200 bg-slate-50 text-slate-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  gray: 'border-gray-200 bg-gray-100 text-gray-600',
};

export const MIN_REMARK_LENGTH = 3;

export const getTransferTaskStatus = (value) =>
  TRANSFER_TASK_STATUS_OPTIONS.find((option) => option.value === value) || TRANSFER_TASK_STATUS_OPTIONS[0];

export const isTransferTaskDone = (status) => status === 'TRANSFERRED' || status === 'NOT_REQUIRED';

export const summarizeTransferTasks = (tasks = []) => {
  const list = Array.isArray(tasks) ? tasks : [];
  const done = list.filter((task) => isTransferTaskDone(task?.status)).length;
  return {
    done,
    total: list.length,
    percent: list.length ? Math.round((done / list.length) * 100) : 0,
    allDone: list.length > 0 && done === list.length,
    issues: list.filter((task) => task?.status === 'ISSUE_REPORTED').length,
    expired: list.filter((task) => task?.status === 'DOCUMENT_EXPIRED').length,
  };
};

export const isValidRemark = (value) => String(value ?? '').trim().length >= MIN_REMARK_LENGTH;
