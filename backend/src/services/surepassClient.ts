type SurepassPayload = Record<string, unknown>;

type SurepassResponse = {
  data?: unknown;
  status_code?: number;
  success?: boolean;
  message?: string | null;
  message_code?: string | null;
};

type SurepassFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export type SurepassErrorKind =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION'
  | 'FORBIDDEN'
  | 'RATE_LIMIT'
  | 'PROVIDER_UNAVAILABLE'
  | 'MALFORMED_RESPONSE';

export class SurepassProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly messageCode: string | null,
    public readonly kind: SurepassErrorKind,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SurepassProviderError';
  }
}

type SurepassClientOptions = {
  baseUrl: string;
  token: string;
  customerId?: string;
  timeoutMs?: number;
  fetchImpl?: SurepassFetch;
};

const safeString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

const providerMessage = (body: SurepassResponse, fallback: string) => safeString(body.message) || fallback;

const classifyError = (statusCode: number): {
  kind: SurepassErrorKind;
  retryable: boolean;
} => {
  if (statusCode === 400 || statusCode === 422) return { kind: 'INVALID_REQUEST', retryable: false };
  if (statusCode === 401) return { kind: 'AUTHENTICATION', retryable: false };
  if (statusCode === 403) return { kind: 'FORBIDDEN', retryable: false };
  if (statusCode === 429) return { kind: 'RATE_LIMIT', retryable: true };
  if (statusCode >= 500) return { kind: 'PROVIDER_UNAVAILABLE', retryable: true };
  return { kind: 'MALFORMED_RESPONSE', retryable: false };
};

const asResponseBody = (value: unknown): SurepassResponse | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as SurepassResponse;
};

export class SurepassClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly customerId: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: SurepassFetch;

  constructor(options: SurepassClientOptions) {
    const parsedBaseUrl = new URL(options.baseUrl);
    if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
      throw new Error('SUREPASS_BASE_URL must use HTTP or HTTPS.');
    }

    if (!options.token.trim()) {
      throw new Error('SUREPASS_TOKEN is required.');
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token.trim();
    this.customerId = options.customerId?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as SurepassFetch);
  }

  private async request(method: 'GET' | 'POST', path: string, payload?: SurepassPayload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (this.customerId) headers['X-Customer-Id'] = this.customerId;

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(method === 'POST' ? { body: JSON.stringify(payload || {}) } : {}),
        signal: controller.signal,
      });

      let body: SurepassResponse | null = null;
      try {
        body = asResponseBody(await response.json());
      } catch {
        body = null;
      }

      const providerStatus = Number.isInteger(body?.status_code) ? Number(body?.status_code) : response.status;
      if (!body || typeof body.success !== 'boolean') {
        const classification = classifyError(providerStatus || 502);
        throw new SurepassProviderError(
          'Surepass returned an invalid response.',
          providerStatus || 502,
          null,
          'MALFORMED_RESPONSE',
          classification.retryable,
        );
      }

      if (!response.ok || body.success !== true) {
        const classification = classifyError(providerStatus || response.status || 502);
        throw new SurepassProviderError(
          providerMessage(body, 'Surepass could not complete this request.'),
          providerStatus || response.status || 502,
          safeString(body.message_code),
          classification.kind,
          classification.retryable,
        );
      }

      return body;
    } catch (error) {
      if (error instanceof SurepassProviderError) throw error;

      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SurepassProviderError(
          'Surepass is taking too long to respond.',
          504,
          'provider_timeout',
          'PROVIDER_UNAVAILABLE',
          true,
        );
      }

      throw new SurepassProviderError(
        'Surepass is temporarily unavailable.',
        503,
        'provider_unavailable',
        'PROVIDER_UNAVAILABLE',
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private post(path: string, payload: SurepassPayload) {
    return this.request('POST', path, payload);
  }

  private get(path: string) {
    return this.request('GET', path);
  }

  initializeDigilocker(payload: {
    signup_flow?: boolean;
    auth_type?: 'web' | 'app';
    aadhaar_xml?: boolean;
    logo_url?: string;
    skip_main_screen?: boolean;
    webhook_url?: string;
  } = {}) {
    return this.post('/api/v1/digilocker/initialize', {
      data: {
        signup_flow: payload.signup_flow ?? true,
        auth_type: payload.auth_type ?? 'web',
        aadhaar_xml: payload.aadhaar_xml ?? true,
        ...(payload.logo_url ? { logo_url: payload.logo_url } : {}),
        ...(payload.skip_main_screen !== undefined ? { skip_main_screen: payload.skip_main_screen } : {}),
        // Webhook delivery is intentionally disabled while direct SDK callbacks are used.
        // To enable provider callbacks later, uncomment the next line and add the verified server URL.
        // ...(payload.webhook_url ? { webhook_url: payload.webhook_url } : {}),
      },
    });
  }

  downloadAadhaar(clientId: string) {
    const normalized = clientId.trim();
    if (!normalized || normalized.length > 200 || /[\u0000-\u001f?#\\]/.test(normalized)) {
      throw new Error('A valid DigiLocker client id is required.');
    }
    return this.get(`/api/v1/digilocker/download-aadhaar/${encodeURIComponent(normalized)}`);
  }

  verifyPan(payload: { id_number: string; full_name: string; dob: string }) {
    return this.post('/api/v1/pan/pan-verify', payload);
  }

  verifyGstin(payload: { id_number: string }) {
    return this.post('/api/v1/corporate/gstin-advanced', payload);
  }

  verifyDrivingLicense(payload: { id_number: string; dob: string }) {
    return this.post('/api/v1/driving-license/driving-license', payload);
  }

  verifyRcFull(payload: { id_number: string }) {
    return this.post('/api/v1/rc/rc-full', payload);
  }

  verifyRcOwnerHistory(payload: { id_number: string }) {
    return this.post('/api/v1/rc/rc-owner-history', payload);
  }

  verifyChassisToRc(payload: { chassis_number: string }) {
    return this.post('/api/v1/rc/chassis-to-rc-details', payload);
  }

  verifyRcToMobile(payload: { rc_number: string }) {
    return this.post('/api/v1/rc/rc-to-mobile-number', payload);
  }

  verifyMobileToRc(payload: { mobile_number: string }) {
    return this.post('/api/v1/rc/mobile-number-to-rc', payload);
  }

  getPanByMobile(payload: { name: string; mobile_no: string }) {
    return this.post('/api/v1/pan/mobile-to-pan', payload);
  }

  checkRcMobileNumber(payload: { rc_number: string; mobile_number: string }) {
    return this.post('/api/v1/rc/rc-mobile-number-check', payload);
  }

  verifyRcChallan(payload: {
    rc_number: string;
  }) {
    return this.post('/api/v1/rc/rc-related/challan-advanced', payload);
  }

  getPanLinkedAadhaar(payload: { pan_number: string }) {
    return this.post('/api/v1/pan/pan-to-aadhaar', payload);
  }

  getPanLinkedContacts(payload: { id_number: string; fetch_email?: true }) {
    return this.post('/api/v1/pan-to-email-mobile/verification', payload);
  }

  getPanComprehensiveV2(
    payload: { id_number: string },
    _environment: 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION',
  ) {
    return this.post('/api/v1/pan/pan-comprehensive', {
      ...payload,
      masked_aadhaar_variant: 'v1, v2, empty',
    });
  }

  getPanFatherName(payload: { id_number: string }) {
    return this.post('/api/v1/pan/pan-to-father-name', payload);
  }
}

export const createSurepassClient = (configured?: { baseUrl: string; token: string; customerId?: string }) => {
  const customerId = configured?.customerId?.trim() || process.env.SUREPASS_CUSTOMER_ID?.trim() || undefined;
  return new SurepassClient({
    baseUrl: configured?.baseUrl?.trim() || process.env.SUREPASS_BASE_URL?.trim() || '',
    token: configured?.token?.trim() || process.env.SUREPASS_TOKEN?.trim() || '',
    ...(customerId ? { customerId } : {}),
  });
};
