const fs = require('fs');

let file = 'backend/src/utils/appSettings.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. DEFAULT_SETTINGS
content = content.replace(
  "  companyInvoice: {",
  "  mobileApp: { playStoreLink: null, appStoreLink: null },\n  companyInvoice: {"
);

// 2. Fallback
content = content.replace(
  "    companyInvoice: {",
  "    mobileApp: { playStoreLink: null, appStoreLink: null },\n    companyInvoice: {"
);

// 3. Admin Controller:
let adminFile = 'backend/src/controllers/admin.controller.ts';
let adminContent = fs.readFileSync(adminFile, 'utf8');
adminContent = adminContent.replace(
  "    if (mobileApp) {",
  "    const mobileApp = req.body.mobileApp as any;\n    if (mobileApp) {"
);
fs.writeFileSync(adminFile, adminContent);

// 4. In appSettings.ts, updatePlatformRuntimeSettings
content = content.replace(
  "  emailOtp?: Partial<Pick<EmailOtpSettings, 'enabled' | 'senderEmail' | 'senderName' | 'appPassword' | 'otpExpiryMinutes' | 'otpLength'>> | null;",
  "  emailOtp?: Partial<Pick<EmailOtpSettings, 'enabled' | 'senderEmail' | 'senderName' | 'appPassword' | 'otpExpiryMinutes' | 'otpLength'>> | null;\n  mobileApp?: any;"
);
content = content.replace(
  "  const hasEmailOtpUpdate = emailOtp !== undefined;",
  "  const hasEmailOtpUpdate = emailOtp !== undefined;\n  const hasMobileAppUpdate = mobileApp !== undefined;"
);

fs.writeFileSync(file, content);
console.log('Fixed typings');
