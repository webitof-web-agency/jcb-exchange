import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { publicUploadDir } from './documentUpload';
import {
  buildPublicBrandingFileName,
  buildPublicBrandingFileUrl,
  type PublicBrandingPurpose,
} from './publicBrandingUpload';

const brandingPurposes = new Set<PublicBrandingPurpose>([
  'finance-support',
  'hero-image',
  'inspection-section',
  'site-logo',
  'site-dark-logo',
  'site-favicon',
  'site-manifest-icon',
]);

const mimeTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const isWithinDirectory = (candidatePath: string, parentPath: string) => {
  const candidate = path.resolve(candidatePath);
  const parent = `${path.resolve(parentPath)}${path.sep}`;
  return candidate.startsWith(parent);
};

const getBrandingUrlPath = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  if (/^https?:\/\//i.test(trimmedValue)) {
    try {
      return new URL(trimmedValue).pathname;
    } catch {
      return null;
    }
  }

  return trimmedValue.split(/[?#]/, 1)[0] || null;
};

export const resolveLocalBrandingFilePath = (
  value: string,
  storageRoot: string = publicUploadDir,
) => {
  const pathname = getBrandingUrlPath(value);
  const match = pathname?.match(/^\/uploads\/public\/([^/]+)\/([^/]+)$/i);
  const purpose = match?.[1]?.toLowerCase() as PublicBrandingPurpose | undefined;
  const fileName = match?.[2];

  if (!purpose || !fileName || !brandingPurposes.has(purpose)) {
    return null;
  }

  let decodedFileName: string;
  try {
    decodedFileName = decodeURIComponent(fileName);
  } catch {
    return null;
  }

  const purposeDirectory = path.join(storageRoot, purpose);
  const candidatePath = path.join(purposeDirectory, decodedFileName);
  return isWithinDirectory(candidatePath, purposeDirectory) ? candidatePath : null;
};

export const isLocalBrandingMediaUrl = (value?: string | null) =>
  typeof value === 'string' && resolveLocalBrandingFilePath(value) !== null;

export const saveBrandingImageLocally = async (
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  purpose: PublicBrandingPurpose,
  storageRoot: string = publicUploadDir,
) => {
  const fileName = buildPublicBrandingFileName(purpose, originalName, randomUUID(), mimeType);
  const purposeDirectory = path.join(storageRoot, purpose);
  await fs.mkdir(purposeDirectory, { recursive: true });
  await fs.writeFile(path.join(purposeDirectory, fileName), buffer);

  return {
    fileName,
    fileUrl: buildPublicBrandingFileUrl(purpose, fileName),
  };
};
