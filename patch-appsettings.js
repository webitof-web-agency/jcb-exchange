const fs = require('fs');

const file = 'backend/src/utils/appSettings.ts';
let content = fs.readFileSync(file, 'utf8');

const mobileAppSettingsType = `
export type MobileAppSettings = {
  playStoreLink: string | null;
  appStoreLink: string | null;
  updatedAt?: string | null;
  updatedByUserId?: string | null;
};
`;

content = content.replace(
  "export type CompanyInvoiceSettings = {",
  mobileAppSettingsType + "\nexport type CompanyInvoiceSettings = {"
);

content = content.replace(
  "  companyInvoice?: CompanyInvoiceSettings;",
  "  companyInvoice?: CompanyInvoiceSettings;\n  mobileApp: MobileAppSettings;"
);

content = content.replace(
  "    companyInvoice: {",
  "    mobileApp: {\n      playStoreLink: null,\n      appStoreLink: null,\n    },\n    companyInvoice: {"
);

content = content.replace(
  "    companyInvoice: {",
  "    mobileApp: {\n      playStoreLink: parsed?.mobileApp?.playStoreLink?.trim() || null,\n      appStoreLink: parsed?.mobileApp?.appStoreLink?.trim() || null,\n      updatedAt: parsed?.mobileApp?.updatedAt || null,\n      updatedByUserId: parsed?.mobileApp?.updatedByUserId || null,\n    },\n    companyInvoice: {"
);

content = content.replace(
  "    settings.companyInvoice.gstin ||",
  "    settings.mobileApp.playStoreLink ||\n    settings.mobileApp.appStoreLink ||\n    settings.companyInvoice.gstin ||"
);

content = content.replace(
  "  emailOtp,",
  "  emailOtp,\n  mobileApp,"
);

content = content.replace(
  "  emailOtp?: Partial<Pick<EmailOtpSettings, 'enabled' | 'senderEmail' | 'senderName' | 'appPassword' | 'otpExpiryMinutes' | 'otpLength'>> | null;",
  "  emailOtp?: Partial<Pick<EmailOtpSettings, 'enabled' | 'senderEmail' | 'senderName' | 'appPassword' | 'otpExpiryMinutes' | 'otpLength'>> | null;\n  mobileApp?: Partial<Pick<MobileAppSettings, 'playStoreLink' | 'appStoreLink'>> | null;"
);

content = content.replace(
  "  const hasEmailOtpUpdate = emailOtp !== undefined;",
  "  const hasEmailOtpUpdate = emailOtp !== undefined;\n  const hasMobileAppUpdate = mobileApp !== undefined;"
);

const mobileAppMerge = `
    mobileApp: hasMobileAppUpdate
      ? {
          playStoreLink: mobileApp?.playStoreLink !== undefined ? (mobileApp.playStoreLink?.trim() || null) : currentSettings.mobileApp.playStoreLink,
          appStoreLink: mobileApp?.appStoreLink !== undefined ? (mobileApp.appStoreLink?.trim() || null) : currentSettings.mobileApp.appStoreLink,
          updatedAt: new Date().toISOString(),
          updatedByUserId: null,
        }
      : currentSettings.mobileApp,
`;

content = content.replace(
  "    companyInvoice: hasCompanyInvoiceUpdate",
  mobileAppMerge + "\n    companyInvoice: hasCompanyInvoiceUpdate"
);

fs.writeFileSync(file, content);
console.log('Patched', file);
