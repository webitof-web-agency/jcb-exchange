import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  type CustomerPrimeSettings,
  normalizeCustomerPrimeSettings,
} from './customerPrime';

type GoogleAuthSettings = {
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
const settingsFilePath = path.join(settingsDirectory, 'app-settings.json');

const defaultSettings: AppSettings = {
  googleAuth: {
    clientId: null,
    updatedAt: null,
    updatedByUserId: null,
  },
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

  try {
    await fs.access(settingsFilePath);
  } catch {
    await fs.writeFile(settingsFilePath, JSON.stringify(defaultSettings, null, 2), 'utf8');
  }
};

export const getAppSettings = async (): Promise<AppSettings> => {
  await ensureSettingsFile();

  try {
    const content = await fs.readFile(settingsFilePath, 'utf8');
    const parsed = JSON.parse(content) as Partial<AppSettings>;

    return {
      googleAuth: {
        clientId: normalizeClientId(parsed.googleAuth?.clientId) || null,
        updatedAt: parsed.googleAuth?.updatedAt || null,
        updatedByUserId: parsed.googleAuth?.updatedByUserId || null,
      },
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
  } catch {
    return defaultSettings;
  }
};

export const updateGoogleAuthSettings = async ({
  clientId,
  updatedByUserId,
}: {
  clientId?: string | null;
  updatedByUserId?: string | null;
}) => {
  const currentSettings = await getAppSettings();

  const nextSettings: AppSettings = {
    ...currentSettings,
    googleAuth: {
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
  publicLeadRouting,
  customerPrime,
  updatedByUserId,
}: {
  googleClientId?: string | null;
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
  const hasGoogleAuthUpdate = googleClientId !== undefined;
  const hasPublicLeadRoutingUpdate = publicLeadRouting !== undefined;
  const hasCustomerPrimeUpdate = customerPrime !== undefined;

  const nextSettings: AppSettings = {
    ...currentSettings,
    googleAuth: hasGoogleAuthUpdate
      ? {
          clientId: normalizeClientId(googleClientId) || null,
          updatedAt: nextTimestamp,
          updatedByUserId: updatedByUserId || null,
        }
      : currentSettings.googleAuth,
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
  return settings.googleAuth.clientId || normalizeClientId(process.env.GOOGLE_CLIENT_ID) || null;
};
