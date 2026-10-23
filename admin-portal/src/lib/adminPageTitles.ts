export const isFinanceTransactionDetailPath = (pathname: string) =>
  /^\/(?:admin|employee)\/finance\/expenses\/[^/]+$/.test(pathname);
