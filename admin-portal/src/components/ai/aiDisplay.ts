const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find((part) => part.type === type)?.value || '';

export const formatAiTimestamp = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  return `${getPart(parts, 'day')}/${getPart(parts, 'month')}/${getPart(parts, 'year')} ${getPart(parts, 'hour')}:${getPart(parts, 'minute')} ${getPart(parts, 'dayPeriod').toUpperCase()}`;
};

export const normalizeAiDisplayText = (value: string): string => value.replace(
  /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/gu,
  (rawTimestamp) => formatAiTimestamp(rawTimestamp) || rawTimestamp,
);
