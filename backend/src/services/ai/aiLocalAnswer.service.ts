type LocalAnswerInput = {
  message: string;
  label: string;
  data: unknown;
  dataAvailability?: 'AVAILABLE' | 'UNAVAILABLE';
  dataAvailabilityMessage?: string;
};

const MAX_LINES = 120;
const MAX_VALUE_LENGTH = 500;

const scalar = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const formatValue = (value: unknown): string => {
  const direct = scalar(value);
  if (direct !== null) return direct.slice(0, MAX_VALUE_LENGTH);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value && typeof value === 'object') return '[details]';
  return '—';
};

const displayKey = (key: string) => key;

const linesFor = (value: unknown, prefix = '', depth = 0): string[] => {
  if (depth > 2) return [];
  const direct = scalar(value);
  if (direct !== null) return prefix ? [`- ${displayKey(prefix)}: ${formatValue(value)}`] : [formatValue(value)];
  if (Array.isArray(value)) {
    const lines: string[] = [];
    value.slice(0, 20).forEach((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const fields = Object.entries(item as Record<string, unknown>)
          .filter(([, child]) => scalar(child) !== null)
          .slice(0, 12)
          .map(([key, child]) => `${displayKey(key)}: ${formatValue(child)}`);
        lines.push(`- ${prefix || 'Item'} ${index + 1}: ${fields.join(' · ') || '[details]'}`);
      } else {
        lines.push(`- ${prefix || 'Item'} ${index + 1}: ${formatValue(item)}`);
      }
    });
    if (value.length > 20) lines.push(`- ... ${value.length - 20} more item(s) are available in the bounded result.`);
    return lines;
  }
  if (!value || typeof value !== 'object') return prefix ? [`- ${displayKey(prefix)}: ${formatValue(value)}`] : [];

  const lines: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) lines.push(...linesFor(child, displayKey(key), depth + 1));
    else if (scalar(child) !== null) lines.push(`- ${displayKey(childPrefix)}: ${formatValue(child)}`);
    else lines.push(...linesFor(child, childPrefix, depth + 1));
    if (lines.length >= MAX_LINES) break;
  }
  return lines.slice(0, MAX_LINES);
};

/**
 * Provider-independent answer for live read-only tool results. It keeps the
 * assistant useful when no external model is configured or the provider is
 * temporarily unavailable, without inventing data or turning an unavailable
 * result into zero.
 */
export const buildLocalAiAnswer = (input: LocalAnswerInput): string => {
  if (input.dataAvailability === 'UNAVAILABLE') {
    return `${input.label}: requested data is unavailable right now.${input.dataAvailabilityMessage ? ` ${input.dataAvailabilityMessage}` : ''}`;
  }

  const lines = linesFor(input.data);
  const question = input.message.trim();
  return [
    `${input.label} (live read-only data)`,
    question ? `Question: ${question}` : '',
    lines.length ? lines.join('\n') : '- No records were returned for this request.',
    'This answer is based on the current permitted application data; it is not a prediction or a completed action.',
  ].filter(Boolean).join('\n');
};
