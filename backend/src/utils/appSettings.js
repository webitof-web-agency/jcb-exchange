"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRuntimeGoogleClientId = exports.updateInspectionSectionSettings = exports.updateHeroImageSettings = exports.updateFinanceSupportSettings = exports.updatePlatformRuntimeSettings = exports.updateGoogleAuthSettings = exports.getAppSettings = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const customerPrime_1 = require("./customerPrime");
const settingsDirectory = path_1.default.resolve(process.cwd(), 'runtime');
const legacySettingsDirectory = path_1.default.resolve(__dirname, '..', '..', 'runtime');
const repoRootLegacySettingsDirectory = path_1.default.resolve(__dirname, '..', '..', '..', 'runtime');
const settingsFilePath = path_1.default.join(settingsDirectory, 'app-settings.json');
const legacySettingsFilePath = path_1.default.join(legacySettingsDirectory, 'app-settings.json');
const repoRootLegacySettingsFilePath = path_1.default.join(repoRootLegacySettingsDirectory, 'app-settings.json');
const settingsFileCandidates = Array.from(new Set([settingsFilePath, legacySettingsFilePath, repoRootLegacySettingsFilePath]));
const defaultSettings = {
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
const isMeaningfulSettings = (settings) => Boolean(settings.googleAuth.clientId ||
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
    settings.inspectionSection.imageUrl);
const normalizeClientId = (value) => {
    const trimmedValue = value?.trim();
    if (!trimmedValue || trimmedValue.startsWith('YOUR_')) {
        return null;
    }
    return trimmedValue;
};
const normalizePhoneNumber = (value) => {
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
const normalizeFinanceSupportItems = (items) => {
    const normalizedItems = [];
    for (const [index, item] of (items || []).entries()) {
        const name = item.name?.trim();
        const imageUrl = item.imageUrl?.trim();
        if (!name || !imageUrl) {
            continue;
        }
        normalizedItems.push({
            id: item.id?.trim() || (0, crypto_1.randomUUID)(),
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
    await fs_1.promises.mkdir(settingsDirectory, { recursive: true });
    const [currentExists, legacyExists, repoRootLegacyExists] = await Promise.all(settingsFileCandidates.map(async (candidatePath) => {
        try {
            await fs_1.promises.access(candidatePath);
            return true;
        }
        catch {
            return false;
        }
    }));
    if (currentExists) {
        return;
    }
    if (legacyExists || repoRootLegacyExists) {
        return;
    }
    await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(defaultSettings, null, 2), 'utf8');
};
const getAppSettings = async () => {
    await ensureSettingsFile();
    try {
        const candidateSnapshots = await Promise.all(settingsFileCandidates.map(async (candidatePath) => {
            try {
                const content = await fs_1.promises.readFile(candidatePath, 'utf8');
                const parsed = JSON.parse(content);
                const snapshot = {
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
                    customerPrime: (0, customerPrime_1.normalizeCustomerPrimeSettings)(parsed.customerPrime),
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
            }
            catch {
                return null;
            }
        }));
        const preferredSnapshot = candidateSnapshots.find((entry) => entry?.meaningful)?.snapshot ||
            candidateSnapshots.find((entry) => entry?.snapshot)?.snapshot ||
            defaultSettings;
        if (!candidateSnapshots.some((entry) => entry?.candidatePath === settingsFilePath && entry.snapshot)) {
            await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(preferredSnapshot, null, 2), 'utf8');
        }
        return preferredSnapshot;
    }
    catch {
        return defaultSettings;
    }
};
exports.getAppSettings = getAppSettings;
const updateGoogleAuthSettings = async ({ clientId, updatedByUserId, }) => {
    const currentSettings = await (0, exports.getAppSettings)();
    const nextSettings = {
        ...currentSettings,
        googleAuth: {
            clientId: normalizeClientId(clientId) || null,
            updatedAt: new Date().toISOString(),
            updatedByUserId: updatedByUserId || null,
        },
    };
    await ensureSettingsFile();
    await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');
    return nextSettings;
};
exports.updateGoogleAuthSettings = updateGoogleAuthSettings;
const updatePlatformRuntimeSettings = async ({ googleClientId, publicLeadRouting, customerPrime, updatedByUserId, }) => {
    const currentSettings = await (0, exports.getAppSettings)();
    const nextTimestamp = new Date().toISOString();
    const hasGoogleAuthUpdate = googleClientId !== undefined;
    const hasPublicLeadRoutingUpdate = publicLeadRouting !== undefined;
    const hasCustomerPrimeUpdate = customerPrime !== undefined;
    const nextSettings = {
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
                ...(0, customerPrime_1.normalizeCustomerPrimeSettings)({
                    ...currentSettings.customerPrime,
                    ...customerPrime,
                }),
                updatedAt: nextTimestamp,
                updatedByUserId: updatedByUserId || null,
            }
            : currentSettings.customerPrime,
    };
    await ensureSettingsFile();
    await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');
    return nextSettings;
};
exports.updatePlatformRuntimeSettings = updatePlatformRuntimeSettings;
const updateFinanceSupportSettings = async ({ items, updatedByUserId, }) => {
    const currentSettings = await (0, exports.getAppSettings)();
    const normalizedItems = normalizeFinanceSupportItems(items).map((item) => ({
        ...item,
        updatedAt: new Date().toISOString(),
        updatedByUserId: updatedByUserId || null,
    }));
    const nextSettings = {
        ...currentSettings,
        financeSupport: {
            items: normalizedItems,
        },
    };
    await ensureSettingsFile();
    await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');
    return nextSettings;
};
exports.updateFinanceSupportSettings = updateFinanceSupportSettings;
const updateHeroImageSettings = async ({ imageUrl, headline, updatedByUserId, }) => {
    const currentSettings = await (0, exports.getAppSettings)();
    const nextSettings = {
        ...currentSettings,
        heroImage: {
            imageUrl: imageUrl?.trim() || null,
            headline: headline?.trim() || null,
            updatedAt: new Date().toISOString(),
            updatedByUserId: updatedByUserId || null,
        },
    };
    await ensureSettingsFile();
    await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');
    return nextSettings;
};
exports.updateHeroImageSettings = updateHeroImageSettings;
const updateInspectionSectionSettings = async ({ title, description, imageUrl, updatedByUserId, }) => {
    const currentSettings = await (0, exports.getAppSettings)();
    const nextSettings = {
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
    await fs_1.promises.writeFile(settingsFilePath, JSON.stringify(nextSettings, null, 2), 'utf8');
    return nextSettings;
};
exports.updateInspectionSectionSettings = updateInspectionSectionSettings;
const getRuntimeGoogleClientId = async () => {
    const settings = await (0, exports.getAppSettings)();
    return settings.googleAuth.clientId || normalizeClientId(process.env.GOOGLE_CLIENT_ID) || null;
};
exports.getRuntimeGoogleClientId = getRuntimeGoogleClientId;
//# sourceMappingURL=appSettings.js.map