const LEGACY_VARIANT_LINE = /^\s*variant\s*:\s*.*$/i;

export const stripLegacyVariantLines = (description) => String(description || '')
  .split(/\r?\n/)
  .filter((line) => !LEGACY_VARIANT_LINE.test(line))
  .join('\n')
  .trim();
