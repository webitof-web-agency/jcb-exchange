export type AiFileAction = {
  type: 'FILE';
  label: string;
  fileName: string;
  mimeType: string;
  url: string;
  previewable: boolean;
  downloadable: boolean;
};

const INTERNAL_FILE_ACTION_PATHS = [
  /^\/api\/documents\/secure\/[A-Za-z0-9._~%()-]+$/,
  /^\/api\/recruitment\/admin\/sell-accounts\/[A-Za-z0-9-]+\/invoice$/,
  /^\/api\/vehicle-docs\/[A-Za-z0-9._~%()-]+\/details\.pdf(?:\?inline=1)?$/,
  /^\/api\/vehicle-docs\/[A-Za-z0-9._~%()-]+\/files\/[A-Za-z0-9._~%()-]+$/,
  /^\/api\/vehicle-docs\/[A-Za-z0-9._~%()-]+\/zip$/,
  /^\/api\/(?:pan|gst|aadhaar)-verification\/[0-9a-f-]{36}\/template$/i,
  /^\/api\/finance-hub\/payroll\/runs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/payslips\.csv$/iu,
  /^\/api\/finance-hub\/payroll\/(?:statutory|full-final)\.csv(?:\?month=\d{4}-(?:0[1-9]|1[0-2]))?$/u,
  /^\/api\/finance-hub\/tax\/export\/(?:gst-sales|gst-purchases|gst-summary|gst-returns|itc|e-invoices|tds|tcs|challans|income-tax)(?:\?[A-Za-z0-9=&%._-]+)?$/u,
  /^\/api\/finance-hub\/data\/export\/(?:tally|trial-balance|day-book|party-balances|gst-sales|gst-purchases|tds|chart-of-accounts)(?:\?[A-Za-z0-9=&%._-]+)?$/u,
  /^\/api\/analytics\/export\/listings\.csv(?:\?[A-Za-z0-9=&%._-]+)?$/u,
] as const;

export const getAiFileRequestPath = (url: string): string | null => {
  if (typeof url !== 'string' || !INTERNAL_FILE_ACTION_PATHS.some((pattern) => pattern.test(url))) return null;
  return url.slice('/api'.length);
};
