type SanitizerOptions = { finalize?: boolean };

const cleanSingleLine = (value: string, finalize: boolean) => {
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  return finalize ? cleaned.trim() : cleaned.trimStart();
};

const cleanMultiline = (value: string, finalize: boolean) => {
  const cleaned = value
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .split('\n')
    .map((line) => {
      const normalized = line.replace(/[\t ]+/g, ' ');
      return finalize ? normalized.trim() : normalized.trimStart();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return finalize ? cleaned.trim() : cleaned;
};

const uppercaseCode = (value: string, invalidCharacters: RegExp, maxLength: number, finalize: boolean) =>
  cleanSingleLine(value, finalize).toUpperCase().replace(invalidCharacters, '').slice(0, maxLength);

export const sanitizeFinanceFieldValue = (field: string, value: string, options: SanitizerOptions = {}) => {
  const finalize = options.finalize ?? true;
  switch (field) {
    case 'accountName':
      return uppercaseCode(value, /[^A-Z0-9&().,' -]/g, 100, finalize);
    case 'reference':
      return uppercaseCode(value, /[^A-Z0-9 _/-]/g, 80, finalize);
    case 'chequeNumber':
      return uppercaseCode(value, /[^A-Z0-9 /-]/g, 40, finalize);
    case 'invoiceNumber':
      return uppercaseCode(value, /[^A-Z0-9 /_.-]/g, 60, finalize);
    case 'name':
      return cleanSingleLine(value, finalize).slice(0, 120);
    case 'category':
      return cleanSingleLine(value, finalize).slice(0, 80);
    case 'narration':
    case 'notes':
      return cleanMultiline(value, finalize).slice(0, 1000);
    default:
      return value;
  }
};

export const sanitizeFinanceFormData = <T extends Record<string, unknown>>(form: T): T =>
  Object.fromEntries(
    Object.entries(form).map(([key, value]) => [key, typeof value === 'string' ? sanitizeFinanceFieldValue(key, value, { finalize: true }) : value]),
  ) as T;
