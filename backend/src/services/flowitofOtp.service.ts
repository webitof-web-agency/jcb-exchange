import type { MobileOtpSettings } from '../utils/mobileOtp';
import { getFlowitofOtpBaseUrl } from '../utils/mobileOtp';

type FlowitofRequestOptions = {
  fetchImplementation?: typeof fetch | undefined;
};

export class FlowitofOtpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FlowitofOtpError';
    this.status = status;
  }
}

const readProviderMessage = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { message?: unknown; error?: unknown };
  const message = candidate.message || candidate.error;
  return typeof message === 'string' && message.trim() ? message.trim() : null;
};

const normalizeTemplateVariables = (value: string | null) => {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return '{otp}';
  }

  // Keep existing advanced values compatible, but let the settings UI accept
  // simple extra values such as "15" without requiring {otp} syntax. Flowitof
  // expects configured DLT values first and the generated OTP value last.
  return normalizedValue.includes('{otp}') ? normalizedValue : `${normalizedValue}|{otp}`;
};

const requestFlowitof = async ({
  endpoint,
  body,
  settings,
  fetchImplementation = fetch,
}: {
  endpoint: 'send' | 'verify' | 'resend';
  body: Record<string, unknown>;
  settings: MobileOtpSettings;
  fetchImplementation?: typeof fetch | undefined;
}) => {
  if (!settings.apiKey || !settings.otpId) {
    throw new FlowitofOtpError(503, 'Flowitof OTP configuration is incomplete.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetchImplementation(`${getFlowitofOtpBaseUrl()}/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: settings.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const providerMessage = readProviderMessage(payload)?.replace(/\s+/g, ' ').slice(0, 200) || null;

    if (!response.ok) {
      if (response.status === 401) {
        throw new FlowitofOtpError(502, 'Flowitof OTP authorization failed.');
      }

      if (response.status === 404) {
        throw new FlowitofOtpError(404, 'Flowitof OTP request was not found.');
      }

      if (response.status === 400) {
        throw new FlowitofOtpError(
          400,
          providerMessage
            ? `Flowitof OTP request was rejected: ${providerMessage}`
            : 'Flowitof OTP request was rejected.',
        );
      }

      throw new FlowitofOtpError(502, 'Flowitof OTP service is temporarily unavailable.');
    }

    return {
      success: true,
      message: readProviderMessage(payload),
    };
  } catch (error) {
    if (error instanceof FlowitofOtpError) {
      throw error;
    }

    throw new FlowitofOtpError(502, 'Flowitof OTP service is temporarily unavailable.');
  } finally {
    clearTimeout(timeout);
  }
};

export const sendFlowitofOtp = (
  mobile: string,
  settings: MobileOtpSettings,
  options?: FlowitofRequestOptions,
) =>
  requestFlowitof({
    endpoint: 'send',
    settings,
    fetchImplementation: options?.fetchImplementation,
    body: {
      mobile,
      otp_id: settings.otpId,
      otp_expiry: settings.otpExpiry,
      otp_length: settings.otpLength,
      variables_values: normalizeTemplateVariables(settings.variablesValues),
    },
  });

export const verifyFlowitofOtp = (
  mobile: string,
  otp: string,
  settings: MobileOtpSettings,
  options?: FlowitofRequestOptions,
) =>
  requestFlowitof({
    endpoint: 'verify',
    settings,
    fetchImplementation: options?.fetchImplementation,
    body: { mobile, otp },
  });

export const resendFlowitofOtp = (
  mobile: string,
  settings: MobileOtpSettings,
  options?: FlowitofRequestOptions,
) =>
  requestFlowitof({
    endpoint: 'resend',
    settings,
    fetchImplementation: options?.fetchImplementation,
    body: { mobile },
  });
