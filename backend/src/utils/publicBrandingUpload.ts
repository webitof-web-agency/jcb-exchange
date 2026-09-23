import path from 'node:path';

export type PublicBrandingPurpose =
  | 'finance-support'
  | 'hero-image'
  | 'inspection-section'
  | 'site-logo'
  | 'site-dark-logo'
  | 'site-favicon'
  | 'site-manifest-icon';

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const buildPublicBrandingFileName = (
  purpose: PublicBrandingPurpose,
  _originalName: string,
  uniqueId: string,
  mimeType: string,
) => {
  const extension = extensionByMimeType[mimeType] || path.extname(_originalName).toLowerCase() || '.bin';
  const safeId = uniqueId.replace(/[^a-zA-Z0-9-]/g, '');
  return `${purpose}-${safeId}${extension}`;
};

export const buildPublicBrandingFileUrl = (
  purpose: PublicBrandingPurpose,
  fileName: string,
) => `/uploads/public/${purpose}/${encodeURIComponent(fileName)}`;
