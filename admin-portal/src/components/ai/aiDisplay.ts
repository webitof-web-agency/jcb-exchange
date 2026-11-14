const getPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find((part) => part.type === type)?.value || '';

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu;
const MONGO_OBJECT_ID_PATTERN = /\b[0-9a-f]{24}\b/giu;
const ENTITY_ID_LABEL_PATTERN = /\b(?:lead|listing|customer|partner|record|transaction|message|application|candidate|vehicle|invoice|payment|user|category|brand|model|blog|task|document|rto|verification|conversation|request|run|feedback)\s+(?:id|identifier)\s*[:#=-]\s*[a-z0-9][a-z0-9._:/-]{2,}/giu;

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

export const normalizeAiDisplayText = (value: string): string => value
  .replace(ENTITY_ID_LABEL_PATTERN, '[REDACTED_INTERNAL_ID]')
  .replace(UUID_PATTERN, '[REDACTED_INTERNAL_ID]')
  .replace(MONGO_OBJECT_ID_PATTERN, '[REDACTED_INTERNAL_ID]')
  .replace(
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z\b/gu,
    (rawTimestamp) => formatAiTimestamp(rawTimestamp) || rawTimestamp,
  );
