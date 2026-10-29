import assert from 'node:assert/strict';
import test from 'node:test';

import { SurepassClient, SurepassProviderError } from './surepassClient';

const response = (payload: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => payload,
});

test('sends PAN verify only to the configured Surepass backend with a bearer token', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://sandbox.surepass.app/',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { client_id: 'client-1' } });
    },
  });

  const result = await client.verifyPan({ id_number: 'ABCPD1234E', full_name: 'Test User', dob: '2000-01-01' });

  assert.equal((result.data as Record<string, unknown>).client_id, 'client-1');
  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://sandbox.surepass.app/api/v1/pan/pan-verify');
  assert.equal(sent.init.method, 'POST');
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
});

test('sends PAN Comprehensive V2 to the documented endpoint in production', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.io/',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { pan_number: 'ACNPR3826N' } });
    },
  });

  await client.getPanComprehensiveV2({ id_number: 'AGYPP1234F' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.io/api/v1/pan/pan-comprehensive');
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent.init.body)), {
    id_number: 'AGYPP1234F',
    masked_aadhaar_variant: 'v1, v2, empty',
  });
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
});

test('sends sandbox PAN comprehensive requests to the documented endpoint with its required variant', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://sandbox.surepass.app',
    token: 'sandbox-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { pan_number: 'ASXPH5090E' } });
    },
  });

  await client.getPanComprehensiveV2({ id_number: 'ASXPH5090E' }, 'SANDBOX');

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://sandbox.surepass.app/api/v1/pan/pan-comprehensive');
  assert.deepEqual(JSON.parse(String(sent.init.body)), {
    id_number: 'ASXPH5090E',
    masked_aadhaar_variant: 'v1, v2, empty',
  });
});

test('sends GSTIN Advanced verification to the documented production endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { gstin: '08AKWPJ1234H1ZN' } });
    },
  });

  await client.verifyGstin({ id_number: '08AKWPJ1234H1ZN' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/corporate/gstin-advanced');
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { id_number: '08AKWPJ1234H1ZN' });
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
});

test('sends driving-license verification to the documented endpoint and optional customer id', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://sandbox.surepass.app',
    token: 'server-only-token',
    customerId: 'customer-123',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { license_number: 'UP2020150000000' } });
    },
  });

  await client.verifyDrivingLicense({ id_number: 'UP2020150000000', dob: '1996-11-23' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://sandbox.surepass.app/api/v1/driving-license/driving-license');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { id_number: 'UP2020150000000', dob: '1996-11-23' });
  assert.equal((sent.init.headers as Record<string, string>)['X-Customer-Id'], 'customer-123');
});

test('sends RC full verification to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { rc_number: 'RJ12XJ1234' } });
    },
  });

  await client.verifyRcFull({ id_number: 'RJ12XJ1234' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/rc/rc-full');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { id_number: 'RJ12XJ1234' });
});

test('sends RC owner history verification to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({
        success: true,
        status_code: 200,
        data: { rc_number: 'GJ01RV8123', current_owner_number: '3', owner_history: [] },
      });
    },
  });

  await client.verifyRcOwnerHistory({ id_number: 'GJ01RV8999' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/rc/rc-owner-history');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { id_number: 'GJ01RV8999' });
});

test('sends chassis-to-RC verification to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { rc_number: 'PB00AZ1234' } });
    },
  });

  await client.verifyChassisToRc({ chassis_number: 'MALBM51ABC123456' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/rc/chassis-to-rc-details');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { chassis_number: 'MALBM51ABC123456' });
});

test('sends RC-to-mobile verification to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { mobile_number: '8890856565' } });
    },
  });

  await client.verifyRcToMobile({ rc_number: 'RJ14XJ1234' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/rc/rc-to-mobile-number');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { rc_number: 'RJ14XJ1234' });
});

test('sends Mobile To RC lookup to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { rc_number: ['RJ14XJ1234'] } });
    },
  });

  await client.verifyMobileToRc({ mobile_number: '8908885858' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/rc/mobile-number-to-rc');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { mobile_number: '8908885858' });
});

test('sends Mobile To PAN lookup to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { pan_number: 'EKRPR1234F' } });
    },
  });

  await client.getPanByMobile({ name: 'Sambhaaji', mobile_no: '8888808969' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/pan/mobile-to-pan');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { name: 'Sambhaaji', mobile_no: '8888808969' });
});

test('sends RC Mobile Number Check to the documented endpoint', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.app',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { is_mobile_number_match: true } });
    },
  });

  await client.checkRcMobileNumber({ rc_number: 'UP10AB1234', mobile_number: '9999000123' });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.app/api/v1/rc/rc-mobile-number-check');
  assert.deepEqual(JSON.parse(String(sent.init.body)), { rc_number: 'UP10AB1234', mobile_number: '9999000123' });
});

test('sends RC Challan Advanced verification with the documented RC number payload', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.io',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { rc_number: 'HR55AP0244', challan_details: [] } });
    },
  });

  await client.verifyRcChallan({
    rc_number: 'HR55AP0244',
  });

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.io/api/v1/rc/rc-related/challan-advanced');
  assert.deepEqual(JSON.parse(String(sent.init.body)), {
    rc_number: 'HR55AP0244',
  });
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
});

test('omits fetch_email when contact lookup did not request email', async () => {
  let body = '';
  const client = new SurepassClient({
    baseUrl: 'https://sandbox.surepass.io',
    token: 'token',
    fetchImpl: async (_url, init) => {
      body = String(init?.body);
      return response({ success: true, status_code: 200, data: {} });
    },
  });

  await client.getPanLinkedContacts({ id_number: 'ABCPD1234E' });
  assert.deepEqual(JSON.parse(body), { id_number: 'ABCPD1234E' });
});

test('normalizes provider failures without treating them as successful responses', async () => {
  const client = new SurepassClient({
    baseUrl: 'https://sandbox.surepass.app',
    token: 'token',
    fetchImpl: async () => response({ success: false, status_code: 422, message: 'Invalid PAN', message_code: 'invalid_format' }, { ok: true, status: 200 }),
  });

  await assert.rejects(
    () => client.getPanLinkedAadhaar({ pan_number: 'ABCPD1234E' }),
    (error: unknown) => error instanceof SurepassProviderError && error.statusCode === 422 && error.messageCode === 'invalid_format',
  );
});

test('initializes the DigiLocker SDK with the server bearer token and nested data payload', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://sandbox.surepass.app/',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { client_id: 'digilocker-client', token: 'sdk-token', expiry_seconds: 600 } });
    },
  });

  const result = await client.initializeDigilocker({ signup_flow: true, skip_main_screen: false });

  assert.equal((result.data as Record<string, unknown>).client_id, 'digilocker-client');
  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://sandbox.surepass.app/api/v1/digilocker/initialize');
  assert.equal(sent.init.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent.init.body)), {
    data: {
      signup_flow: true,
      auth_type: 'web',
      aadhaar_xml: true,
      skip_main_screen: false,
    },
  });
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
});

test('downloads Aadhaar data by client id without sending the client token to the browser', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const client = new SurepassClient({
    baseUrl: 'https://kyc-api.surepass.io',
    token: 'server-only-token',
    fetchImpl: async (url, init) => {
      request = { url, init: init ?? {} };
      return response({ success: true, status_code: 200, data: { client_id: 'digilocker/client' } });
    },
  });

  await client.downloadAadhaar('digilocker/client');

  const sent = request as unknown as { url: string; init: RequestInit };
  assert.ok(sent);
  assert.equal(sent.url, 'https://kyc-api.surepass.io/api/v1/digilocker/download-aadhaar/digilocker%2Fclient');
  assert.equal(sent.init.method, 'GET');
  assert.equal(sent.init.body, undefined);
  assert.equal((sent.init.headers as Record<string, string>).Authorization, 'Bearer server-only-token');
});

test('does not expose the retired stamped eSign provider surface', () => {
  const prototype = SurepassClient.prototype as unknown as Record<string, unknown>;
  for (const method of [
    'getEstampStates',
    'getEstampArticles',
    'orderEstamp',
    'getEstampOrderStatus',
    'initializeStampedEsign',
    'uploadEsignPdfViaLink',
    'getEsignStatus',
    'getSignedEsignDocument',
    'getEsignAuditTrail',
  ]) {
    assert.equal(prototype[method], undefined, `retired provider method remains: ${method}`);
  }
});
