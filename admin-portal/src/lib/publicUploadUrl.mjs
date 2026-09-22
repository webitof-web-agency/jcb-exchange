export const normalizePublicUploadUrl = (value) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      parsed.pathname = parsed.pathname.replace(/^\/api(?=\/uploads\/public(?:\/|$))/i, '');
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  return trimmed.replace(/^\/api(?=\/uploads\/public(?:\/|$))/i, '');
};
