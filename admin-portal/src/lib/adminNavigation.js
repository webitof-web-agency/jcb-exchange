/**
 * Insert a module navigation item before Analytics when present, or append it
 * when the user does not have access to Analytics.
 */
export const insertAccountsNavItem = (items, accountsItem) => {
  const uniqueItems = items.filter(
    (item, index, allItems) => allItems.findIndex((candidate) => candidate.href === item.href) === index,
  );
  const analyticsIndex = uniqueItems.findIndex((item) => item.href.endsWith('/analytics'));

  if (analyticsIndex === -1) {
    return [...uniqueItems, accountsItem];
  }

  return [
    ...uniqueItems.slice(0, analyticsIndex),
    accountsItem,
    ...uniqueItems.slice(analyticsIndex),
  ];
};
