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
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'DOCUMENT_REQUIRED', label: 'Document Required' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

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

export const normalizeRtoStatus = (value) =>
  rtoStatusOptions.some((option) => option.value === value) ? value : 'PENDING';

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
