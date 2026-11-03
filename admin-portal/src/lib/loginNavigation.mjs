export const navigateToAuthenticatedPortal = (router, destination) => {
  if (!destination) return false;

  router.replace(destination);
  return true;
};
