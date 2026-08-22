import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
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
};

const settingsDirectory = path.resolve(process.cwd(), 'runtime');
const legacySettingsDirectory = path.resolve(__dirname, '..', '..', 'runtime');
const repoRootLegacySettingsDirectory = path.resolve(__dirname, '..', '..', '..', 'runtime');
const settingsFilePath = path.join(settingsDirectory, 'app-settings.json');
const legacySettingsFilePath = path.join(legacySettingsDirectory, 'app-settings.json');
const repoRootLegacySettingsFilePath = path.join(repoRootLegacySettingsDirectory, 'app-settings.json');
const settingsFileCandidates = Array.from(
  new Set([settingsFilePath, legacySettingsFilePath, repoRootLegacySettingsFilePath]),
);

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
};

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
      settings.inspectionSection.imageUrl,
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

export const getAppSettings = async (): Promise<AppSettings> => {
  await ensureSettingsFile();

  try {
    const candidateSnapshots = await Promise.all(
      settingsFileCandidates.map(async (candidatePath) => {
        try {
          const content = await fs.readFile(candidatePath, 'utf8');
          const parsed = JSON.parse(content) as Partial<AppSettings>;

          const snapshot: AppSettings = {
            googleAuth: {
              enabled: parsed.googleAuth?.enabled === true,
              clientId: normalizeClientId(parsed.googleAuth?.clientId) || null,
              updatedAt: parsed.googleAuth?.updatedAt || null,
              updatedByUserId: parsed.googleAuth?.updatedByUserId || null,
            },
            mobileOtp: normalizeMobileOtpSettings(parsed.mobileOtp),
            publicLeadRouting: {
              useSellerContact: parsed.publicLeadRouting?.useSellerContact === true,
              adminCallNumber: normalizePhoneNumber(parsed.publicLeadRouting?.adminCallNumber) || null,
              adminWhatsappNumber: normalizePhoneNumber(parsed.publicLeadRouting?.adminWhatsappNumber) || null,
              updatedAt: parsed.publicLeadRouting?.updatedAt || null,
              updatedByUserId: parsed.publicLeadRouting?.updatedByUserId || null,
            },
            customerPrime: normalizeCustomerPrimeSettings(parsed.customerPrime),
            financeSupport: {
              items: normalizeFinanceSupportItems(parsed.financeSupport?.items),
            },
            heroImage: {
              imageUrl: parsed.heroImage?.imageUrl?.trim() || null,
              headline: parsed.heroImage?.headline?.trim() || null,
              updatedAt: parsed.heroImage?.updatedAt || null,
              updatedByUserId: parsed.heroImage?.updatedByUserId || null,
            },
            inspectionSection: {
              title: parsed.inspectionSection?.title?.trim() || null,
              description: parsed.inspectionSection?.description?.trim() || null,
              imageUrl: parsed.inspectionSection?.imageUrl?.trim() || null,
              updatedAt: parsed.inspectionSection?.updatedAt || null,
              updatedByUserId: parsed.inspectionSection?.updatedByUserId || null,
            },
          };

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
      await fs.writeFile(settingsFilePath, JSON.stringify(preferredSnapshot, null, 2), 'utf8');
    }

    return preferredSnapshot;
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

  await ensureSettingsFile();
  await fs.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');

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

  await ensureSettingsFile();
  await fs.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');

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

  await ensureSettingsFile();
  await fs.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');

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

  await ensureSettingsFile();
  await fs.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');

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

  await ensureSettingsFile();
  await fs.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');

  return nextSettings;
};

export const getRuntimeGoogleClientId = async () => {
  const settings = await getAppSettings();
  const runtimeClientId = settings.googleAuth.clientId || normalizeClientId(process.env.GOOGLE_CLIENT_ID) || null;
  const isEnabled = settings.googleAuth.enabled === true;

  return isEnabled ? runtimeClientId : null;
};
