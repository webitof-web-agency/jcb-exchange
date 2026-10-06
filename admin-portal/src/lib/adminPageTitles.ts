export const isFinanceTransactionDetailPath = (pathname: string) =>
  /^\/(?:superadmin|admin|employee)\/finance\/expenses\/[^/]+$/.test(pathname);
