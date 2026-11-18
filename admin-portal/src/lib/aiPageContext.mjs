export const resolveAiPageContext = (matcher, pathname) => {
  if (typeof matcher !== 'function') return undefined;
  return matcher(pathname) || undefined;
};
