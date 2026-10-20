const STATUS_META = {
  API_VERIFIED: {
    label: 'API Verified',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  VERIFIED: {
    label: 'Verified',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  SUCCESS: {
    label: 'Verified',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  VERIFYING: {
    label: 'Verifying',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  PENDING: {
    label: 'Verifying',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
  FAILED: {
    label: 'Verification Failed',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  MANUALLY_MODIFIED: {
    label: 'Manually Modified',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  REVERIFICATION_REQUIRED: {
    label: 'Re-verification Required',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  CHANGED: {
    label: 'Re-verification Required',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
};

const NOT_VERIFIED = {
  label: 'Not Verified',
  className: 'border-gray-200 bg-gray-50 text-gray-600',
};

export const getListingVerificationDisplay = (status) => {
  const normalizedStatus = String(status || '').trim().toUpperCase();
  return STATUS_META[normalizedStatus] || NOT_VERIFIED;
};
