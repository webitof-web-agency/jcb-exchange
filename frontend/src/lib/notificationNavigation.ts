export const getNotificationHref = (link?: string | null) => {
  const normalized = String(link || '').trim();

  if (normalized.startsWith('/') && !normalized.startsWith('//')) {
    return normalized;
  }

  return '/machines';
};
