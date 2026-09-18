export type MobileOtpSettings = {
  enabled: boolean;
  apiKey: string | null;
  otpId: string | null;
  otpExpiry: number;
  otpLength: number;
  variablesValues: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

type LegacyMobileOtpSettings = Partial<MobileOtpSettings> & {
  templateId?: string | null;
};

export const FLOWITOF_DEFAULT_OTP_BASE_URL = 'https://sms.flowitof.com/dev/otp';
export const MOBILE_OTP_COOLDOWN_SECONDS = 45;
export const MOBILE_OTP_RESEND_WINDOW_SECONDS = 10 * 60;
export const MOBILE_OTP_MAX_RESENDS = 5;
export const MOBILE_OTP_MAX_VERIFY_ATTEMPTS = 5;

export const defaultMobileOtpSettings: MobileOtpSettings = {
  enabled: false,
  apiKey: null,
  otpId: null,
  otpExpiry: 15,
  otpLength: 6,
  variablesValues: null,
  updatedAt: null,
  updatedByUserId: null,
};

const normalizeTrimmedValue = (value?: string | null) => {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
};

const normalizeInteger = (value: unknown, minimum: number, maximum: number, fallback: number) => {
  const parsedValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < minimum || parsedValue > maximum) {
    return fallback;
  }

  return parsedValue;
};

export const normalizeMobileOtpSettings = (
  settings?: LegacyMobileOtpSettings | null,
): MobileOtpSettings => ({
  enabled: settings?.enabled === true,
  apiKey: normalizeTrimmedValue(settings?.apiKey),
  otpId: normalizeTrimmedValue(settings?.otpId ?? settings?.templateId),
  otpExpiry: normalizeInteger(settings?.otpExpiry, 1, 10080, defaultMobileOtpSettings.otpExpiry),
  otpLength: normalizeInteger(settings?.otpLength, 4, 10, defaultMobileOtpSettings.otpLength),
  variablesValues: normalizeTrimmedValue(settings?.variablesValues),
  updatedAt: settings?.updatedAt || null,
  updatedByUserId: settings?.updatedByUserId || null,
});

export const normalizeLoginMobileNumber = (value?: string | null) => {
  const digitsOnly = value?.replace(/\D/g, '') || '';

  if (digitsOnly.length === 10) {
    return digitsOnly;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return digitsOnly.slice(1);
  }

  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    return digitsOnly.slice(2);
  }

  return null;
};

export const maskMobileNumber = (mobile: string) =>
  mobile.length < 4 ? mobile : `${'*'.repeat(Math.max(0, mobile.length - 4))}${mobile.slice(-4)}`;

export const getFlowitofOtpBaseUrl = () => {
  const configuredUrl = process.env.FLOWITOF_OTP_BASE_URL?.trim() || FLOWITOF_DEFAULT_OTP_BASE_URL;

  try {
    const parsedUrl = new URL(configuredUrl);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('Flowitof OTP base URL must use HTTPS.');
    }

    return configuredUrl.replace(/\/+$/, '');
  } catch (error) {
    if (error instanceof Error && error.message.includes('must use HTTPS')) {
      throw error;
    }

    throw new Error('Flowitof OTP base URL is invalid.');
  }
};
