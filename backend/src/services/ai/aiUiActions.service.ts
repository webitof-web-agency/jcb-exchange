const SECURE_DOCUMENT_ROUTE = /^\/api\/documents\/secure\/[A-Za-z0-9._~%()-]+$/u;
const GENERATED_INVOICE_ROUTE = /^\/api\/recruitment\/admin\/sell-accounts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/invoice$/iu;
const VEHICLE_DETAILS_ROUTE = /^\/api\/vehicle-docs\/[A-Za-z0-9._~%()-]+\/details\.pdf(?:\?inline=1)?$/u;
const VEHICLE_FILE_ROUTE = /^\/api\/vehicle-docs\/[A-Za-z0-9._~%()-]+\/files\/[A-Za-z0-9._~%()-]+$/u;
const VEHICLE_ZIP_ROUTE = /^\/api\/vehicle-docs\/[A-Za-z0-9._~%()-]+\/zip$/u;
const VERIFICATION_TEMPLATE_ROUTE = /^\/api\/(?:pan|gst|aadhaar)-verification\/[0-9a-f-]{36}\/template$/iu;
const PAYROLL_FILE_ROUTE = /^\/api\/finance-hub\/payroll\/(?:runs\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/payslips\.csv|statutory\.csv\?month=\d{4}-(?:0[1-9]|1[0-2])|full-final\.csv)$/iu;
const TAX_FILE_ROUTE = /^\/api\/finance-hub\/tax\/export\/(?:gst-sales|gst-purchases|gst-summary|gst-returns|itc|e-invoices|tds|tcs|challans|income-tax)(?:\?[A-Za-z0-9=&%._-]+)?$/u;
const ACCOUNTING_EXPORT_ROUTE = /^\/api\/finance-hub\/data\/export\/(?:tally|trial-balance|day-book|party-balances|gst-sales|gst-purchases|tds|chart-of-accounts)(?:\?[A-Za-z0-9=&%._-]+)?$/u;
const ANALYTICS_EXPORT_ROUTE = /^\/api\/analytics\/export\/listings\.csv(?:\?[A-Za-z0-9=&%._-]+)?$/u;

export type AiFileAction = {
  type: 'FILE';
  label: string;
  fileName: string;
  mimeType: string;
  url: string;
  previewable: boolean;
  downloadable: true;
};

type AiFileActionInput = {
  label: string;
  fileName: string;
  mimeType: string;
  url: string;
};

const safeText = (value: string, maxLength: number) => value
  .replace(/[\u0000-\u001F\u007F]/gu, '')
  .trim()
  .slice(0, maxLength);

const safeFileName = (value: string) => safeText(value, 160)
  .replace(/[\\/:*?"<>|]/gu, '_')
  .replace(/\.{2,}/gu, '.')
  .trim() || 'document';

const isAllowedFileRoute = (url: string) => SECURE_DOCUMENT_ROUTE.test(url)
  || GENERATED_INVOICE_ROUTE.test(url)
  || VEHICLE_DETAILS_ROUTE.test(url)
  || VEHICLE_FILE_ROUTE.test(url)
  || VEHICLE_ZIP_ROUTE.test(url)
  || VERIFICATION_TEMPLATE_ROUTE.test(url)
  || PAYROLL_FILE_ROUTE.test(url)
  || TAX_FILE_ROUTE.test(url)
  || ACCOUNTING_EXPORT_ROUTE.test(url)
  || ANALYTICS_EXPORT_ROUTE.test(url);

export const buildAiFileAction = (input: AiFileActionInput): AiFileAction | null => {
  const url = safeText(input.url, 500);
  if (!isAllowedFileRoute(url)) return null;

  const mimeType = safeText(input.mimeType, 100).toLowerCase() || 'application/octet-stream';
  return {
    type: 'FILE',
    label: safeText(input.label, 80) || 'File',
    fileName: safeFileName(input.fileName),
    mimeType,
    url,
    previewable: mimeType === 'application/pdf' || mimeType.startsWith('image/'),
    downloadable: true,
  };
};
