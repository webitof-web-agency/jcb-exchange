const fs = require('fs');

const file = 'backend/src/controllers/admin.controller.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. mobileApp in getPlatformSettings
content = content.replace(
  "      customerPrime: settings.customerPrime,",
  "      customerPrime: settings.customerPrime,\n      mobileApp: {\n        playStoreLink: settings.mobileApp.playStoreLink || '',\n        appStoreLink: settings.mobileApp.appStoreLink || '',\n      },"
);

// 2. mobileApp in updatePlatformSettings Request payload
content = content.replace(
  "    const { googleClientId, googleAuthEnabled, publicLeadRouting, customerPrime, listingPayment, emailOtp, companyInvoice } = req.body as {",
  "    const { googleClientId, googleAuthEnabled, mobileOtp, publicLeadRouting, customerPrime, listingPayment, emailOtp, companyInvoice, mobileApp } = req.body as {"
);
content = content.replace(
  "      companyInvoice?: {",
  "      mobileOtp?: {\n        enabled?: boolean;\n        apiKey?: string;\n        senderId?: string;\n        templateId?: string;\n        templateMessage?: string;\n      };\n      mobileApp?: {\n        playStoreLink?: string;\n        appStoreLink?: string;\n      };\n      companyInvoice?: {"
);
content = content.replace(
  "    if (googleClientId === undefined && googleAuthEnabled === undefined && !publicLeadRouting && !customerPrime && !listingPayment && !emailOtp && !companyInvoice) {",
  "    if (googleClientId === undefined && googleAuthEnabled === undefined && !mobileOtp && !publicLeadRouting && !customerPrime && !listingPayment && !emailOtp && !companyInvoice && !mobileApp) {"
);

// 3. processing mobileOtp and mobileApp in updatePlatformSettings
content = content.replace(
  "    if (publicLeadRouting) {",
  `    if (mobileOtp) {
      settingsPayload.mobileOtp = {
        ...(mobileOtp.enabled !== undefined ? { enabled: mobileOtp.enabled } : {}),
        ...(mobileOtp.apiKey !== undefined ? { apiKey: mobileOtp.apiKey } : {}),
        ...(mobileOtp.senderId !== undefined ? { senderId: mobileOtp.senderId } : {}),
        ...(mobileOtp.templateId !== undefined ? { templateId: mobileOtp.templateId } : {}),
        ...(mobileOtp.templateMessage !== undefined ? { templateMessage: mobileOtp.templateMessage } : {}),
        updatedAt: new Date().toISOString(),
        updatedByUserId: req.user?.id,
      };
    }

    if (mobileApp) {
      settingsPayload.mobileApp = {
        ...(mobileApp.playStoreLink !== undefined ? { playStoreLink: mobileApp.playStoreLink } : {}),
        ...(mobileApp.appStoreLink !== undefined ? { appStoreLink: mobileApp.appStoreLink } : {}),
        updatedAt: new Date().toISOString(),
        updatedByUserId: req.user?.id,
      };
    }

    if (publicLeadRouting) {`
);

// 4. Return value in updatePlatformSettings
content = content.replace(
  "      companyInvoice: settings.companyInvoice,",
  "      companyInvoice: settings.companyInvoice,\n      mobileOtp: {\n        enabled: settings.mobileOtp.enabled,\n        apiKey: settings.mobileOtp.apiKey || '',\n        senderId: settings.mobileOtp.senderId || '',\n        templateId: settings.mobileOtp.templateId || '',\n        templateMessage: settings.mobileOtp.templateMessage || '',\n        updatedAt: settings.mobileOtp.updatedAt,\n        updatedByUserId: settings.mobileOtp.updatedByUserId,\n      },\n      mobileApp: {\n        playStoreLink: settings.mobileApp.playStoreLink || '',\n        appStoreLink: settings.mobileApp.appStoreLink || '',\n      },"
);

fs.writeFileSync(file, content);
console.log('Patched', file);
