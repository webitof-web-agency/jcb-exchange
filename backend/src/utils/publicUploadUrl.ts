export const normalizePublicUploadUrl = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

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
