import { getRtoStatusOptions, normalizeRtoStatus } from './rtoWorkStatusForm.mjs';

export const buildRtoStatusFilterOptions = (records = []) => {
  const statusOptions = getRtoStatusOptions();
  const counts = new Map(statusOptions.map((option) => [option.value, 0]));

  records.forEach((record) => {
    const status = normalizeRtoStatus(record?.rtoStatus);
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  return [
    { value: 'ALL', label: `All RTO Statuses (${records.length})` },
    ...statusOptions.map((option) => ({
      value: option.value,
      label: `${option.label} (${counts.get(option.value) || 0})`,
    })),
  ];
};
