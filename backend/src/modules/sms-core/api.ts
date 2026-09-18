export type DltSmsRequest = {
  baseUrl: string;
  apiKey: string;
  senderId: string;
  messageId: string;
  numbers: string;
  variablesValues: string;
  smsDetails: '0' | '1';
};

type SmsResponse = Record<string, unknown> & {
  message?: string;
  error?: string | { message?: string };
  request_id?: string;
  message_id?: string;
  id?: string;
};

const getProviderError = (result: SmsResponse) => {
  if (typeof result.error === 'string') return result.error;
  if (result.error && typeof result.error === 'object' && typeof result.error.message === 'string') return result.error.message;
  if (typeof result.message === 'string') return result.message;
  return 'The SMS provider rejected the request.';
};

export const sendDltSms = async (
  request: DltSmsRequest,
  options: { fetchImplementation?: typeof fetch } = {},
) => {
  const fetchImplementation = options.fetchImplementation || fetch;
  const response = await fetchImplementation(`${request.baseUrl.replace(/\/+$/, '')}/bulkV2`, {
    method: 'POST',
    headers: {
      Authorization: request.apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender_id: request.senderId,
      message: request.messageId,
      variables_values: request.variablesValues,
      route: 'dlt',
      numbers: request.numbers,
      sms_details: request.smsDetails,
    }),
  });
  const result = await response.json().catch(() => ({})) as SmsResponse;
  if (!response.ok) throw new Error(`Flowitof SMS request was rejected: ${getProviderError(result)}`);
  return {
    providerMessageId: [result.request_id, result.message_id, result.id].find((value): value is string => typeof value === 'string' && value.length > 0) || null,
    response: result,
  };
};
