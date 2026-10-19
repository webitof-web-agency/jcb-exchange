const baseValidityOptions = [
  { value: 'VALID', label: 'Valid' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'LIFETIME', label: 'LLT' },
];

const legacyValidityLabels = {
  NOT_AVAILABLE: 'Not Available',
  NOT_APPLICABLE: 'Not Applicable',
  PENDING: 'Pending',
};

const rtoStatusOptions = [
  { value: 'RTO_WORK_STARTED', label: 'RTO Work Start' },
  { value: 'RTO_WORK_IN_PROGRESS', label: 'RTO Work Progress' },
  { value: 'RTO_WORK_FAILED', label: 'RTO Work Failed / Errors' },
  { value: 'RTO_WORK_COMPLETED', label: 'RTO Work Completed' },
  { value: 'DEAL_DONE', label: 'Deal Done' },
];

const rtoStatusLabels = {
  PENDING: 'RTO Work Progress',
  IN_PROGRESS: 'RTO Work Progress',
  DOCUMENT_REQUIRED: 'RTO Work Start',
  SUBMITTED: 'RTO Work Start',
  APPROVED: 'RTO Work Start',
  REJECTED: 'RTO Work Failed / Errors',
  COMPLETED: 'RTO Work Completed',
  CANCELLED: 'RTO Work Failed / Errors',
  RTO_WORK_STARTED: 'RTO Work Start',
  RTO_WORK_IN_PROGRESS: 'RTO Work Progress',
  RTO_WORK_FAILED: 'RTO Work Failed / Errors',
  RTO_WORK_COMPLETED: 'RTO Work Completed',
  DEAL_DONE: 'Deal Done',
};

const legacyStatusMap = {
  PENDING: 'RTO_WORK_IN_PROGRESS',
  IN_PROGRESS: 'RTO_WORK_IN_PROGRESS',
  DOCUMENT_REQUIRED: 'RTO_WORK_STARTED',
  SUBMITTED: 'RTO_WORK_STARTED',
  APPROVED: 'RTO_WORK_STARTED',
  REJECTED: 'RTO_WORK_FAILED',
  CANCELLED: 'RTO_WORK_FAILED',
  COMPLETED: 'RTO_WORK_COMPLETED',
};

const hsrpStatusOptions = [
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
  { value: 'NOT_APPLICABLE', label: 'Not Required' },
  { value: 'PENDING', label: 'Pending' },
];

export const getHsrpStatusOptions = () => hsrpStatusOptions;

export const normalizeHsrpStatus = (value) => {
  const normalized = String(value || '').toUpperCase();
  if (normalized === 'NOT_REQUIRED' || normalized === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (normalized === 'YES') return 'YES';
  if (normalized === 'NO') return 'NO';
  if (normalized === 'PENDING') return 'PENDING';
  return 'NO';
};

export const getRtoStatusOptions = () => rtoStatusOptions;

export const getRtoStatusLabel = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  const canonical = legacyStatusMap[normalized] || normalized;
  return rtoStatusLabels[canonical] || rtoStatusLabels.RTO_WORK_IN_PROGRESS;
};

export const normalizeRtoStatus = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  const canonical = legacyStatusMap[normalized] || normalized;
  return rtoStatusOptions.some((option) => option.value === canonical)
    ? canonical
    : 'RTO_WORK_IN_PROGRESS';
};

export const normalizeRemark = (value) =>
  typeof value === 'string' ? value.trim() : '';

export const getInitialTermsAccepted = (mode) => mode === 'edit';

export const getValidityOptions = (currentValue = '', includeLifetime = true) => {
  const options = includeLifetime
    ? baseValidityOptions
    : baseValidityOptions.filter((option) => option.value !== 'LIFETIME');

  if (!currentValue || options.some((option) => option.value === currentValue)) {
    return options;
  }

  if (currentValue === 'LIFETIME') {
    return [...options, { value: currentValue, label: 'LLT' }];
  }

  if (!Object.hasOwn(legacyValidityLabels, currentValue)) {
    return options;
  }

  return [
    ...options,
    { value: currentValue, label: legacyValidityLabels[currentValue] || currentValue },
  ];
};

export const normalizeValidityForEdit = (value) => {
  const options = getValidityOptions(value);
  return options.some((option) => option.value === value) ? value : 'VALID';
};

export const isValidityDateRequired = (status) => status === 'VALID';

export const filterSelectOptions = (options, query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return options;

  return options.filter((option) =>
    `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery),
  );
};
