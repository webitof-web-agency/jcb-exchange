import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma';
import { uploadRootDir } from './documentUpload';
import {
  type CustomerPrimeSettings,
  normalizeCustomerPrimeSettings,
} from './customerPrime';
import {
  type MobileOtpSettings,
  defaultMobileOtpSettings,
  normalizeMobileOtpSettings,
} from './mobileOtp';

type GoogleAuthSettings = {
  enabled: boolean;
  clientId: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

type PublicLeadRoutingSettings = {
  useSellerContact: boolean;
  adminCallNumber: string | null;
  adminWhatsappNumber: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type FinanceSupportItem = {
  id: string;
  name: string;
  imageUrl: string;
  displayOrder: number;
  row: 1 | 2;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type InspectionSectionSettings = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type SiteLogoSettings = {
  imageUrl: string | null;
  faviconUrl: string | null;
  manifestIconUrl: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type FooterSocialLink = {
  id: string;
  platform: string;
  url: string;
  displayOrder: number;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type FooterSettings = {
  socialLinks: FooterSocialLink[];
  contact: {
    phoneNumber: string | null;
    phoneLabel: string | null;
    emailAddress: string | null;
    emailLabel: string | null;
    address: string | null;
    updatedAt: string | null;
    updatedByUserId: string | null;
  };
  legalPages: {
    privacyPolicy: string | null;
    termsConditions: string | null;
    disclaimer: string | null;
    updatedAt: string | null;
    updatedByUserId: string | null;
  };
};

type AppSettings = {
  googleAuth: GoogleAuthSettings;
  mobileOtp: MobileOtpSettings;
  publicLeadRouting: PublicLeadRoutingSettings;
  customerPrime: CustomerPrimeSettings;
  financeSupport: {
    items: FinanceSupportItem[];
  };
  heroImage: {
    imageUrl: string | null;
    headline: string | null;
    updatedAt: string | null;
    updatedByUserId: string | null;
  };
  inspectionSection: InspectionSectionSettings;
  siteLogo: SiteLogoSettings;
  footer: FooterSettings;
};

const platformRuntimeSettingsKey = 'platform';
const prismaAny = prisma as any;

const resolveRuntimeStorageBaseDir = () => {
  const configuredDirectory =
    process.env.APP_RUNTIME_STORAGE_DIR?.trim() ||
    process.env.APP_STORAGE_DIR?.trim();

  if (!configuredDirectory) {
    return process.cwd();
  }

  return path.isAbsolute(configuredDirectory)
    ? configuredDirectory
    : path.resolve(process.cwd(), configuredDirectory);
};

const runtimeStorageBaseDir = resolveRuntimeStorageBaseDir();
const settingsDirectory = path.resolve(runtimeStorageBaseDir, 'runtime');
const legacySettingsDirectory = path.resolve(__dirname, '..', '..', 'runtime');
const repoRootLegacySettingsDirectory = path.resolve(__dirname, '..', '..', '..', 'runtime');
const settingsFilePath = path.join(settingsDirectory, 'app-settings.json');
const legacySettingsFilePath = path.join(legacySettingsDirectory, 'app-settings.json');
const repoRootLegacySettingsFilePath = path.join(repoRootLegacySettingsDirectory, 'app-settings.json');
const settingsFileCandidates = Array.from(
  new Set([settingsFilePath, legacySettingsFilePath, repoRootLegacySettingsFilePath]),
);
const siteLogoPublicUrlPrefix = '/uploads/public/site-logo/';
const siteFaviconPublicUrlPrefix = '/uploads/public/site-favicon/';
const siteManifestIconPublicUrlPrefix = '/uploads/public/site-manifest-icon/';
const supportedFooterSocialPlatforms = new Set(['FACEBOOK', 'INSTAGRAM', 'TWITTER']);

const defaultSettings: AppSettings = {
  googleAuth: {
    enabled: false,
    clientId: null,
    updatedAt: null,
    updatedByUserId: null,
  },
  mobileOtp: defaultMobileOtpSettings,
  publicLeadRouting: {
    useSellerContact: false,
    adminCallNumber: null,
    adminWhatsappNumber: null,
    updatedAt: null,
    updatedByUserId: null,
  },
  customerPrime: {
    enabled: false,
    upiId: null,
    amount: null,
    validityValue: null,
    validityUnit: 'DAYS',
    applyToCustomerRoleOnly: true,
    requireForCall: true,
    requireForWhatsapp: true,
    requireForSellListing: true,
    updatedAt: null,
    updatedByUserId: null,
  },
  financeSupport: {
    items: [],
  },
  heroImage: {
    imageUrl: null,
    headline: null,
    updatedAt: null,
    updatedByUserId: null,
  },
  inspectionSection: {
    title: null,
    description: null,
    imageUrl: null,
    updatedAt: null,
    updatedByUserId: null,
  },
  siteLogo: {
    imageUrl: null,
    faviconUrl: null,
    manifestIconUrl: null,
    updatedAt: null,
    updatedByUserId: null,
  },
  footer: {
    socialLinks: [],
    contact: {
      phoneNumber: null,
      phoneLabel: null,
      emailAddress: null,
      emailLabel: null,
      address: null,
      updatedAt: null,
      updatedByUserId: null,
    },
    legalPages: {
      privacyPolicy: null,
      termsConditions: null,
      disclaimer: null,
      updatedAt: null,
      updatedByUserId: null,
    },
  },
};

const parseTimestamp = (value?: string | null) => {
  if (!value) {
    return 0;
  }

  const parsedValue = Date.parse(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const getSettingsFreshnessScore = (settings?: AppSettings | null) => {
  if (!settings) {
    return 0;
  }

  return Math.max(
    parseTimestamp(settings.googleAuth.updatedAt),
    parseTimestamp(settings.mobileOtp.updatedAt),
    parseTimestamp(settings.publicLeadRouting.updatedAt),
    parseTimestamp(settings.customerPrime.updatedAt),
    parseTimestamp(settings.heroImage.updatedAt),
    parseTimestamp(settings.inspectionSection.updatedAt),
    parseTimestamp(settings.siteLogo.updatedAt),
    parseTimestamp(settings.footer.contact.updatedAt),
    parseTimestamp(settings.footer.legalPages.updatedAt),
    ...settings.financeSupport.items.map((item) => parseTimestamp(item.updatedAt)),
    ...settings.footer.socialLinks.map((item) => parseTimestamp(item.updatedAt)),
  );
};

const normalizeAppSettingsSnapshot = (parsed?: Partial<AppSettings> | null): AppSettings => ({
  googleAuth: {
    enabled: parsed?.googleAuth?.enabled === true,
    clientId: normalizeClientId(parsed?.googleAuth?.clientId) || null,
    updatedAt: parsed?.googleAuth?.updatedAt || null,
    updatedByUserId: parsed?.googleAuth?.updatedByUserId || null,
  },
  mobileOtp: normalizeMobileOtpSettings(parsed?.mobileOtp),
  publicLeadRouting: {
    useSellerContact: parsed?.publicLeadRouting?.useSellerContact === true,
    adminCallNumber: normalizePhoneNumber(parsed?.publicLeadRouting?.adminCallNumber) || null,
    adminWhatsappNumber: normalizePhoneNumber(parsed?.publicLeadRouting?.adminWhatsappNumber) || null,
    updatedAt: parsed?.publicLeadRouting?.updatedAt || null,
    updatedByUserId: parsed?.publicLeadRouting?.updatedByUserId || null,
  },
  customerPrime: normalizeCustomerPrimeSettings(parsed?.customerPrime),
  financeSupport: {
    items: normalizeFinanceSupportItems(parsed?.financeSupport?.items),
  },
  heroImage: {
    imageUrl: parsed?.heroImage?.imageUrl?.trim() || null,
    headline: parsed?.heroImage?.headline?.trim() || null,
    updatedAt: parsed?.heroImage?.updatedAt || null,
    updatedByUserId: parsed?.heroImage?.updatedByUserId || null,
  },
  inspectionSection: {
    title: parsed?.inspectionSection?.title?.trim() || null,
    description: parsed?.inspectionSection?.description?.trim() || null,
    imageUrl: parsed?.inspectionSection?.imageUrl?.trim() || null,
    updatedAt: parsed?.inspectionSection?.updatedAt || null,
    updatedByUserId: parsed?.inspectionSection?.updatedByUserId || null,
  },
  siteLogo: {
    imageUrl: parsed?.siteLogo?.imageUrl?.trim() || null,
    faviconUrl: parsed?.siteLogo?.faviconUrl?.trim() || null,
    manifestIconUrl: parsed?.siteLogo?.manifestIconUrl?.trim() || null,
    updatedAt: parsed?.siteLogo?.updatedAt || null,
    updatedByUserId: parsed?.siteLogo?.updatedByUserId || null,
  },
  footer: {
    socialLinks: normalizeFooterSocialLinks(parsed?.footer?.socialLinks),
    contact: {
      phoneNumber: normalizePhoneDisplayNumber(parsed?.footer?.contact?.phoneNumber) || null,
      phoneLabel: parsed?.footer?.contact?.phoneLabel?.trim() || null,
      emailAddress: normalizeEmailAddress(parsed?.footer?.contact?.emailAddress) || null,
      emailLabel: parsed?.footer?.contact?.emailLabel?.trim() || null,
      address: normalizeMultilineText(parsed?.footer?.contact?.address) || null,
      updatedAt: parsed?.footer?.contact?.updatedAt || null,
      updatedByUserId: parsed?.footer?.contact?.updatedByUserId || null,
    },
    legalPages: {
      privacyPolicy: parsed?.footer?.legalPages?.privacyPolicy?.trim() || null,
      termsConditions: parsed?.footer?.legalPages?.termsConditions?.trim() || null,
      disclaimer: parsed?.footer?.legalPages?.disclaimer?.trim() || null,
      updatedAt: parsed?.footer?.legalPages?.updatedAt || null,
      updatedByUserId: parsed?.footer?.legalPages?.updatedByUserId || null,
    },
  },
});

const isMeaningfulSettings = (settings: AppSettings) =>
  Boolean(
    settings.googleAuth.enabled ||
    settings.googleAuth.clientId ||
    settings.mobileOtp.enabled ||
    settings.mobileOtp.apiKey ||
    settings.mobileOtp.senderId ||
    settings.mobileOtp.templateId ||
    settings.mobileOtp.templateMessage ||
    settings.publicLeadRouting.useSellerContact ||
    settings.publicLeadRouting.adminCallNumber ||
    settings.publicLeadRouting.adminWhatsappNumber ||
    settings.customerPrime.enabled ||
    settings.customerPrime.upiId ||
    settings.customerPrime.amount !== null ||
    settings.customerPrime.validityValue !== null ||
    settings.financeSupport.items.length > 0 ||
    settings.heroImage.imageUrl ||
    settings.heroImage.headline ||
    settings.inspectionSection.title ||
    settings.inspectionSection.description ||
    settings.inspectionSection.imageUrl ||
    settings.siteLogo.imageUrl ||
    settings.siteLogo.faviconUrl ||
    settings.siteLogo.manifestIconUrl ||
    settings.footer.socialLinks.length > 0 ||
    settings.footer.contact.phoneNumber ||
    settings.footer.contact.phoneLabel ||
    settings.footer.contact.emailAddress ||
    settings.footer.contact.emailLabel ||
    settings.footer.contact.address,
  );

const normalizeClientId = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue || trimmedValue.startsWith('YOUR_')) {
    return null;
  }

  return trimmedValue;
};

const normalizePhoneNumber = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  const normalizedDigits = trimmedValue.replace(/\D/g, '');
  if (normalizedDigits.length < 10) {
    return null;
  }

  return normalizedDigits;
};

const normalizePhoneDisplayNumber = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  return normalizePhoneNumber(trimmedValue) ? trimmedValue : null;
};

const normalizeEmailAddress = (value?: string | null) => {
  const trimmedValue = value?.trim().toLowerCase();
  if (!trimmedValue) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue) ? trimmedValue : null;
};

const normalizeMultilineText = (value?: string | null) => {
  const normalizedValue = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  return normalizedValue?.trim() || null;
};

const normalizeExternalUrl = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  const candidateValue = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(candidateValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
};

const normalizeFinanceSupportItems = (items?: Partial<FinanceSupportItem>[]): FinanceSupportItem[] => {
  const normalizedItems: FinanceSupportItem[] = [];

  for (const [index, item] of (items || []).entries()) {
    const name = item.name?.trim();
    const imageUrl = item.imageUrl?.trim();

    if (!name || !imageUrl) {
      continue;
    }

    normalizedItems.push({
      id: item.id?.trim() || randomUUID(),
      name,
      imageUrl,
      displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : index,
      row: item.row === 2 ? 2 : 1,
      updatedAt: item.updatedAt || null,
      updatedByUserId: item.updatedByUserId || null,
    });
  }

  return normalizedItems
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((item, index) => ({
      ...item,
      displayOrder: index,
    }));
};

const normalizeFooterSocialLinks = (items?: Partial<FooterSocialLink>[]): FooterSocialLink[] => {
  const normalizedItems: FooterSocialLink[] = [];

  for (const [index, item] of (items || []).entries()) {
    const platform = item.platform?.trim().toUpperCase();
    if (!platform || !supportedFooterSocialPlatforms.has(platform)) {
      continue;
    }

    const url = normalizeExternalUrl(item.url);

    if (!url) {
      continue;
    }

    normalizedItems.push({
      id: item.id?.trim() || randomUUID(),
      platform,
      url,
      displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : index,
      updatedAt: item.updatedAt || null,
      updatedByUserId: item.updatedByUserId || null,
    });
  }

  return normalizedItems
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((item, index) => ({
      ...item,
      displayOrder: index,
    }));
};

const resolveManagedBrandingFilePath = (fileUrl?: string | null) => {
  const normalizedUrl = fileUrl?.trim();
  if (!normalizedUrl) {
    return null;
  }

  if (normalizedUrl.startsWith(siteLogoPublicUrlPrefix)) {
    return path.join(uploadRootDir, normalizedUrl.replace(siteLogoPublicUrlPrefix, `public${path.sep}site-logo${path.sep}`));
  }

  if (normalizedUrl.startsWith(siteFaviconPublicUrlPrefix)) {
    return path.join(uploadRootDir, normalizedUrl.replace(siteFaviconPublicUrlPrefix, `public${path.sep}site-favicon${path.sep}`));
  }

  if (normalizedUrl.startsWith(siteManifestIconPublicUrlPrefix)) {
    return path.join(uploadRootDir, normalizedUrl.replace(siteManifestIconPublicUrlPrefix, `public${path.sep}site-manifest-icon${path.sep}`));
  }

  return null;
};

const removeManagedBrandingFile = async (fileUrl?: string | null) => {
  const absolutePath = resolveManagedBrandingFilePath(fileUrl);
  if (!absolutePath) {
    return;
  }

  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
  }
};

const ensureSettingsFile = async () => {
  await fs.mkdir(settingsDirectory, { recursive: true });

  const [currentExists, legacyExists, repoRootLegacyExists] = await Promise.all(
    settingsFileCandidates.map(async (candidatePath) => {
      try {
        await fs.access(candidatePath);
        return true;
      } catch {
        return false;
      }
    }),
  );

  if (currentExists) {
    return;
  }

  if (legacyExists || repoRootLegacyExists) {
    return;
  }

  await fs.writeFile(settingsFilePath, JSON.stringify(defaultSettings, null, 2), 'utf8');
};

const writeSettingsFileSnapshot = async (settings: AppSettings) => {
  await ensureSettingsFile();
  await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf8');
};

const readDatabaseSettings = async (): Promise<AppSettings | null> => {
  try {
    const record = await prismaAny.platformRuntimeSettings.findUnique({
      where: { key: platformRuntimeSettingsKey },
      select: { payload: true },
    });

    if (!record) {
      return null;
    }

    return normalizeAppSettingsSnapshot(record.payload as Partial<AppSettings>);
  } catch {
    return null;
  }
};

const persistDatabaseSettings = async (settings: AppSettings) => {
  try {
    await prismaAny.platformRuntimeSettings.upsert({
      where: { key: platformRuntimeSettingsKey },
      update: {
        payload: settings,
      },
      create: {
        key: platformRuntimeSettingsKey,
        payload: settings,
      },
    });
  } catch {
    // File fallback remains available when the database record cannot be written.
  }
};

const readFileSettings = async (): Promise<AppSettings> => {
  const candidateSnapshots = await Promise.all(
    settingsFileCandidates.map(async (candidatePath) => {
      try {
        const content = await fs.readFile(candidatePath, 'utf8');
        const parsed = JSON.parse(content) as Partial<AppSettings>;
        const snapshot = normalizeAppSettingsSnapshot(parsed);

        return {
          candidatePath,
          snapshot,
          meaningful: isMeaningfulSettings(snapshot),
        };
      } catch {
        return null;
      }
    }),
  );

  const preferredSnapshot =
    candidateSnapshots.find((entry) => entry?.meaningful)?.snapshot ||
    candidateSnapshots.find((entry) => entry?.snapshot)?.snapshot ||
    defaultSettings;

  if (!candidateSnapshots.some((entry) => entry?.candidatePath === settingsFilePath && entry.snapshot)) {
    await writeSettingsFileSnapshot(preferredSnapshot);
  }

  return preferredSnapshot;
};

const persistSettings = async (settings: AppSettings) => {
  await Promise.all([
    persistDatabaseSettings(settings),
    writeSettingsFileSnapshot(settings),
  ]);
};

export const getAppSettings = async (): Promise<AppSettings> => {
  await ensureSettingsFile();

  try {
    const databaseSettings = await readDatabaseSettings();
    const fileSettings = await readFileSettings();
    const databaseIsMeaningful = Boolean(databaseSettings && isMeaningfulSettings(databaseSettings));
    const fileIsMeaningful = isMeaningfulSettings(fileSettings);

    if (databaseIsMeaningful && fileIsMeaningful) {
      const databaseFreshness = getSettingsFreshnessScore(databaseSettings);
      const fileFreshness = getSettingsFreshnessScore(fileSettings);
      const preferredSettings = fileFreshness > databaseFreshness ? fileSettings : (databaseSettings as AppSettings);

      if (preferredSettings === fileSettings) {
        await persistDatabaseSettings(fileSettings);
      } else {
        await writeSettingsFileSnapshot(databaseSettings as AppSettings);
      }

      return preferredSettings;
    }

    if (databaseIsMeaningful) {
      await writeSettingsFileSnapshot(databaseSettings as AppSettings);
      return databaseSettings as AppSettings;
    }

    if (fileIsMeaningful) {
      await persistDatabaseSettings(fileSettings);
      return fileSettings;
    }

    return databaseSettings || fileSettings;
  } catch {
    return defaultSettings;
  }
};

export const updateGoogleAuthSettings = async ({
  enabled,
  clientId,
  updatedByUserId,
}: {
  enabled?: boolean;
  clientId?: string | null;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();

  const nextSettings: AppSettings = {
    ...currentSettings,
    googleAuth: {
      enabled: enabled === true,
      clientId: normalizeClientId(clientId) || null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: updatedByUserId || null,
    },
  };

  await persistSettings(nextSettings);

  return nextSettings;
};

export const updatePlatformRuntimeSettings = async ({
  googleClientId,
  googleAuthEnabled,
  mobileOtp,
  publicLeadRouting,
  customerPrime,
  updatedByUserId,
}: {
  googleClientId?: string | null;
  googleAuthEnabled?: boolean;
  mobileOtp?: Partial<
    Pick<
      MobileOtpSettings,
      'enabled' | 'apiKey' | 'senderId' | 'templateId' | 'templateMessage'
    >
  > | null;
  publicLeadRouting?: Partial<Pick<PublicLeadRoutingSettings, 'useSellerContact' | 'adminCallNumber' | 'adminWhatsappNumber'>> | null;
  customerPrime?: Partial<
    Pick<
      CustomerPrimeSettings,
      | 'enabled'
      | 'upiId'
      | 'amount'
      | 'validityValue'
      | 'validityUnit'
      | 'applyToCustomerRoleOnly'
      | 'requireForCall'
      | 'requireForWhatsapp'
      | 'requireForSellListing'
    >
  > | null;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();
  const nextTimestamp = new Date().toISOString();
  const hasGoogleAuthUpdate = googleClientId !== undefined || googleAuthEnabled !== undefined;
  const hasMobileOtpUpdate = mobileOtp !== undefined;
  const hasPublicLeadRoutingUpdate = publicLeadRouting !== undefined;
  const hasCustomerPrimeUpdate = customerPrime !== undefined;

  const nextSettings: AppSettings = {
    ...currentSettings,
    googleAuth: hasGoogleAuthUpdate
      ? {
        enabled:
          googleAuthEnabled !== undefined
            ? googleAuthEnabled === true
            : currentSettings.googleAuth.enabled,
        clientId:
          googleClientId !== undefined
            ? normalizeClientId(googleClientId) || null
            : currentSettings.googleAuth.clientId,
        updatedAt: nextTimestamp,
        updatedByUserId: updatedByUserId || null,
      }
      : currentSettings.googleAuth,
    mobileOtp: hasMobileOtpUpdate
      ? {
        ...normalizeMobileOtpSettings({
          ...currentSettings.mobileOtp,
          ...mobileOtp,
        }),
        updatedAt: nextTimestamp,
        updatedByUserId: updatedByUserId || null,
      }
      : currentSettings.mobileOtp,
    publicLeadRouting: hasPublicLeadRoutingUpdate
      ? {
        useSellerContact: publicLeadRouting?.useSellerContact === true,
        adminCallNumber: normalizePhoneNumber(publicLeadRouting?.adminCallNumber) || null,
        adminWhatsappNumber: normalizePhoneNumber(publicLeadRouting?.adminWhatsappNumber) || null,
        updatedAt: nextTimestamp,
        updatedByUserId: updatedByUserId || null,
      }
      : currentSettings.publicLeadRouting,
    customerPrime: hasCustomerPrimeUpdate
      ? {
        ...normalizeCustomerPrimeSettings({
          ...currentSettings.customerPrime,
          ...customerPrime,
        }),
        updatedAt: nextTimestamp,
        updatedByUserId: updatedByUserId || null,
      }
      : currentSettings.customerPrime,
  };

  await persistSettings(nextSettings);

  return nextSettings;
};

export const updateFinanceSupportSettings = async ({
  items,
  updatedByUserId,
}: {
  items?: Array<Partial<FinanceSupportItem>>;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();
  const normalizedItems = normalizeFinanceSupportItems(items).map((item) => ({
    ...item,
    updatedAt: new Date().toISOString(),
    updatedByUserId: updatedByUserId || null,
  }));

  const nextSettings: AppSettings = {
    ...currentSettings,
    financeSupport: {
      items: normalizedItems,
    },
  };

  await persistSettings(nextSettings);

  return nextSettings;
};

export const updateHeroImageSettings = async ({
  imageUrl,
  headline,
  updatedByUserId,
}: {
  imageUrl?: string | null;
  headline?: string | null;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();

  const nextSettings: AppSettings = {
    ...currentSettings,
    heroImage: {
      imageUrl: imageUrl?.trim() || null,
      headline: headline?.trim() || null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: updatedByUserId || null,
    },
  };

  await persistSettings(nextSettings);

  return nextSettings;
};

export const updateInspectionSectionSettings = async ({
  title,
  description,
  imageUrl,
  updatedByUserId,
}: {
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();

  const nextSettings: AppSettings = {
    ...currentSettings,
    inspectionSection: {
      title: title?.trim() || null,
      description: description?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      updatedAt: new Date().toISOString(),
      updatedByUserId: updatedByUserId || null,
    },
  };

  await persistSettings(nextSettings);

  return nextSettings;
};

export const updateSiteLogoSettings = async ({
  imageUrl,
  faviconUrl,
  manifestIconUrl,
  updatedByUserId,
}: {
  imageUrl?: string | null;
  faviconUrl?: string | null;
  manifestIconUrl?: string | null;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();
  const normalizedImageUrl = imageUrl?.trim() || null;
  const normalizedFaviconUrl = faviconUrl?.trim() || null;
  const normalizedManifestIconUrl = manifestIconUrl?.trim() || null;

  const previousImageUrl = currentSettings.siteLogo.imageUrl;
  const previousFaviconUrl = currentSettings.siteLogo.faviconUrl;
  const previousManifestIconUrl = currentSettings.siteLogo.manifestIconUrl;

  const nextSettings: AppSettings = {
    ...currentSettings,
    siteLogo: {
      imageUrl: normalizedImageUrl,
      faviconUrl: normalizedFaviconUrl,
      manifestIconUrl: normalizedManifestIconUrl,
      updatedAt: new Date().toISOString(),
      updatedByUserId: updatedByUserId || null,
    },
  };

  await persistSettings(nextSettings);

  const cleanupTargets: Array<string | null | undefined> = [];
  if (previousImageUrl && previousImageUrl !== normalizedImageUrl) {
    cleanupTargets.push(previousImageUrl);
  }
  if (previousFaviconUrl && previousFaviconUrl !== normalizedFaviconUrl) {
    cleanupTargets.push(previousFaviconUrl);
  }
  if (previousManifestIconUrl && previousManifestIconUrl !== normalizedManifestIconUrl) {
    cleanupTargets.push(previousManifestIconUrl);
  }

  await Promise.all(cleanupTargets.map((target) => removeManagedBrandingFile(target)));

  return nextSettings;
};

export const updateFooterSettings = async ({
  socialLinks,
  contact,
  legalPages,
  updatedByUserId,
}: {
  socialLinks?: Array<Partial<FooterSocialLink>>;
  contact?: Partial<FooterSettings['contact']>;
  legalPages?: Partial<FooterSettings['legalPages']>;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();
  const nextTimestamp = new Date().toISOString();
  const normalizedSocialLinks = normalizeFooterSocialLinks(socialLinks).map((item) => ({
    ...item,
    updatedAt: nextTimestamp,
    updatedByUserId: updatedByUserId || null,
  }));

  const nextSettings: AppSettings = {
    ...currentSettings,
    footer: {
      socialLinks: normalizedSocialLinks,
      contact: {
        phoneNumber: normalizePhoneDisplayNumber(contact?.phoneNumber) || null,
        phoneLabel: contact?.phoneLabel?.trim() || null,
        emailAddress: normalizeEmailAddress(contact?.emailAddress) || null,
        emailLabel: contact?.emailLabel?.trim() || null,
        address: normalizeMultilineText(contact?.address) || null,
        updatedAt: nextTimestamp,
        updatedByUserId: updatedByUserId || null,
      },
      legalPages: {
        privacyPolicy: legalPages?.privacyPolicy !== undefined ? (legalPages.privacyPolicy?.trim() || null) : currentSettings.footer.legalPages.privacyPolicy,
        termsConditions: legalPages?.termsConditions !== undefined ? (legalPages.termsConditions?.trim() || null) : currentSettings.footer.legalPages.termsConditions,
        disclaimer: legalPages?.disclaimer !== undefined ? (legalPages.disclaimer?.trim() || null) : currentSettings.footer.legalPages.disclaimer,
        updatedAt: nextTimestamp,
        updatedByUserId: updatedByUserId || null,
      },
    },
  };

  await persistSettings(nextSettings);

  return nextSettings;
};

export const getRuntimeGoogleClientId = async () => {
  const settings = await getAppSettings();
  const runtimeClientId = settings.googleAuth.clientId || normalizeClientId(process.env.GOOGLE_CLIENT_ID) || null;
  const isEnabled = settings.googleAuth.enabled === true;

  return isEnabled ? runtimeClientId : null;
};
