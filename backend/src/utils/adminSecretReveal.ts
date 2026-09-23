export const ADMIN_SECRET_KEYS = [
  'mobileOtpApiKey',
  'emailOtpAppPassword',
  'razorpayKeySecret',
  'razorpayWebhookSecret',
  'phonepeClientSecret',
  'googleDriveClientSecret',
  'googleDriveRefreshToken',
] as const;

export type AdminSecretKey = (typeof ADMIN_SECRET_KEYS)[number];
export type AdminSecretValues = Record<AdminSecretKey, string | null | undefined>;

export const isAdminSecretKey = (value: string): value is AdminSecretKey =>
  (ADMIN_SECRET_KEYS as readonly string[]).includes(value);

export const getAdminSecretValue = (key: AdminSecretKey, values: AdminSecretValues) =>
  values[key] || '';
