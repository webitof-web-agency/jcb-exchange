import { type CustomerPrimeSettings } from './customerPrime';
import { type MobileOtpSettings } from './mobileOtp';
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
export declare const getAppSettings: () => Promise<AppSettings>;
export declare const updateGoogleAuthSettings: ({ clientId, updatedByUserId, }: {
    clientId?: string | null;
    updatedByUserId?: string | null;
}) => Promise<AppSettings>;
export declare const updatePlatformRuntimeSettings: ({ googleClientId, mobileOtp, publicLeadRouting, customerPrime, updatedByUserId, }: {
    googleClientId?: string | null;
    mobileOtp?: Partial<Pick<MobileOtpSettings, 'enabled' | 'apiKey' | 'senderId' | 'templateId' | 'templateMessage'>> | null;
    publicLeadRouting?: Partial<Pick<PublicLeadRoutingSettings, 'useSellerContact' | 'adminCallNumber' | 'adminWhatsappNumber'>> | null;
    customerPrime?: Partial<Pick<CustomerPrimeSettings, 'enabled' | 'upiId' | 'amount' | 'validityValue' | 'validityUnit' | 'applyToCustomerRoleOnly' | 'requireForCall' | 'requireForWhatsapp' | 'requireForSellListing'>> | null;
    updatedByUserId?: string | null;
}) => Promise<AppSettings>;
export declare const updateFinanceSupportSettings: ({ items, updatedByUserId, }: {
    items?: Array<Partial<FinanceSupportItem>>;
    updatedByUserId?: string | null;
}) => Promise<AppSettings>;
export declare const updateHeroImageSettings: ({ imageUrl, headline, updatedByUserId, }: {
    imageUrl?: string | null;
    headline?: string | null;
    updatedByUserId?: string | null;
}) => Promise<AppSettings>;
export declare const updateInspectionSectionSettings: ({ title, description, imageUrl, updatedByUserId, }: {
    title?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    updatedByUserId?: string | null;
}) => Promise<AppSettings>;
export declare const getRuntimeGoogleClientId: () => Promise<string | null>;
export {};
//# sourceMappingURL=appSettings.d.ts.map