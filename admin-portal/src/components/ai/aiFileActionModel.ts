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
] as const;

export const getAiFileRequestPath = (url: string): string | null => {
  if (typeof url !== 'string' || !INTERNAL_FILE_ACTION_PATHS.some((pattern) => pattern.test(url))) return null;
  return url.slice('/api'.length);
};
