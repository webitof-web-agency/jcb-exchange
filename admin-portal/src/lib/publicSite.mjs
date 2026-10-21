const isSafeRelativePath = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');

export const getPublicSiteTarget = ({ origin, token, fallbackPath = '/' }) => {
  const publicSiteUrl = new URL('/login', `${String(origin || '').replace(/\/+$/, '')}/`);
  const safePath = isSafeRelativePath(fallbackPath) ? fallbackPath : '/';

  if (token) {
    publicSiteUrl.searchParams.set('token', token);
  }

  publicSiteUrl.searchParams.set('next', safePath);
  return publicSiteUrl.toString();
};
