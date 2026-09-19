const fs = require('fs');

const file = 'backend/src/controllers/admin.controller.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. mobileApp in getPlatformSettings
if (!content.includes('playStoreLink: settings.mobileApp.playStoreLink')) {
  content = content.replace(
    "      customerPrime: settings.customerPrime,",
    "      customerPrime: settings.customerPrime,\n      mobileApp: {\n        playStoreLink: settings.mobileApp.playStoreLink || '',\n        appStoreLink: settings.mobileApp.appStoreLink || '',\n      },"
  );

  // 2. mobileApp in updatePlatformSettings Request payload
  // find the correct type definition
  content = content.replace(
    "    const { googleClientId, googleAuthEnabled, mobileOtp, emailOtp, publicLeadRouting, customerPrime, listingPayment, companyInvoice } = req.body as {",
    "    const { googleClientId, googleAuthEnabled, mobileOtp, emailOtp, publicLeadRouting, customerPrime, listingPayment, companyInvoice, mobileApp } = req.body as {"
  );
  content = content.replace(
    "      companyInvoice?: {",
    "      mobileApp?: {\n        playStoreLink?: string;\n        appStoreLink?: string;\n      };\n      companyInvoice?: {"
  );
  content = content.replace(
    "      !companyInvoice",
    "      !companyInvoice &&\n      !mobileApp"
  );

  // 3. processing mobileApp in updatePlatformSettings
  content = content.replace(
    "    if (publicLeadRouting) {",
    `    if (mobileApp) {
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
    "      companyInvoice: settings.companyInvoice,\n      mobileApp: {\n        playStoreLink: settings.mobileApp.playStoreLink || '',\n        appStoreLink: settings.mobileApp.appStoreLink || '',\n      },"
  );
}

fs.writeFileSync(file, content);
console.log('Patched admin controller clean');
