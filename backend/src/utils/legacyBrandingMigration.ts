import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getAppSettings,
  updateFinanceSupportSettings,
  updateHeroImageSettings,
  updateInspectionSectionSettings,
  updateSiteLogoSettings,
} from './appSettings';
import { publicUploadDir } from './documentUpload';
import { extractDriveFileId, streamFileFromDrive } from '../services/googleDrive.service';
import {
  buildPublicBrandingFileName,
  buildPublicBrandingFileUrl,
  type PublicBrandingPurpose,
} from './publicBrandingUpload';

const isLegacyDriveUrl = (value?: string | null) => {
  if (!value?.trim()) return false;

  const fileId = extractDriveFileId(value);
  return Boolean(fileId);
};

const streamToBuffer = async (stream: NodeJS.ReadableStream) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const getImageMimeType = (buffer: Buffer) => {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }

  throw new Error('Unsupported legacy branding image format.');
};

const migrateImage = async (value: string | null | undefined, purpose: PublicBrandingPurpose) => {
  if (!isLegacyDriveUrl(value)) {
    return value || null;
  }

  const fileId = extractDriveFileId(value);
  if (!fileId) {
    return value || null;
  }

  const buffer = await streamToBuffer(await streamFileFromDrive(fileId));
  if (!buffer.length) {
    throw new Error(`Legacy branding asset ${fileId} is empty.`);
  }

  const mimeType = getImageMimeType(buffer);
  const fileName = buildPublicBrandingFileName(purpose, purpose, fileId, mimeType);
  const directory = path.join(publicUploadDir, purpose);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), buffer);

  return buildPublicBrandingFileUrl(purpose, fileName);
};

export const migrateLegacyBrandingMediaToLocal = async () => {
  const settings = await getAppSettings();
  let migratedCount = 0;

  const nextFinanceItems = [];
  for (const item of settings.financeSupport.items) {
    try {
      const nextImageUrl = await migrateImage(item.imageUrl, 'finance-support');
      if (nextImageUrl !== item.imageUrl) migratedCount += 1;
      nextFinanceItems.push({ ...item, imageUrl: nextImageUrl || item.imageUrl });
    } catch (error) {
      console.error(`Branding migration failed for finance item ${item.id}:`, error instanceof Error ? error.message : error);
      nextFinanceItems.push(item);
    }
  }

  if (nextFinanceItems.some((item, index) => item.imageUrl !== settings.financeSupport.items[index]?.imageUrl)) {
    await updateFinanceSupportSettings({ items: nextFinanceItems });
  }

  let nextHeroImageUrl = settings.heroImage.imageUrl;
  try {
    nextHeroImageUrl = await migrateImage(settings.heroImage.imageUrl, 'hero-image');
    if (nextHeroImageUrl !== settings.heroImage.imageUrl) migratedCount += 1;
  } catch (error) {
    console.error('Branding migration failed for hero image:', error instanceof Error ? error.message : error);
  }

  if (nextHeroImageUrl !== settings.heroImage.imageUrl) {
    await updateHeroImageSettings({ imageUrl: nextHeroImageUrl, headline: settings.heroImage.headline });
  }

  let nextInspectionImageUrl = settings.inspectionSection.imageUrl;
  try {
    nextInspectionImageUrl = await migrateImage(settings.inspectionSection.imageUrl, 'inspection-section');
    if (nextInspectionImageUrl !== settings.inspectionSection.imageUrl) migratedCount += 1;
  } catch (error) {
    console.error('Branding migration failed for inspection image:', error instanceof Error ? error.message : error);
  }

  if (nextInspectionImageUrl !== settings.inspectionSection.imageUrl) {
    await updateInspectionSectionSettings({
      imageUrl: nextInspectionImageUrl,
      title: settings.inspectionSection.title,
      description: settings.inspectionSection.description,
    });
  }

  const nextLogo = {
    imageUrl: settings.siteLogo.imageUrl,
    darkLogoUrl: settings.siteLogo.darkLogoUrl,
    faviconUrl: settings.siteLogo.faviconUrl,
    manifestIconUrl: settings.siteLogo.manifestIconUrl,
  };
  const logoPurposes: Array<[keyof typeof nextLogo, PublicBrandingPurpose]> = [
    ['imageUrl', 'site-logo'],
    ['darkLogoUrl', 'site-dark-logo'],
    ['faviconUrl', 'site-favicon'],
    ['manifestIconUrl', 'site-manifest-icon'],
  ];

  for (const [key, purpose] of logoPurposes) {
    try {
      const nextValue = await migrateImage(nextLogo[key], purpose);
      if (nextValue !== nextLogo[key]) migratedCount += 1;
      nextLogo[key] = nextValue;
    } catch (error) {
      console.error(`Branding migration failed for ${key}:`, error instanceof Error ? error.message : error);
    }
  }

  if (Object.keys(nextLogo).some((key) => nextLogo[key as keyof typeof nextLogo] !== settings.siteLogo[key as keyof typeof nextLogo])) {
    await updateSiteLogoSettings(nextLogo);
  }

  if (migratedCount > 0) {
    console.info(`Migrated ${migratedCount} legacy branding asset(s) from Google Drive to local public storage.`);
  }
};
