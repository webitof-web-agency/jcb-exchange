const MARKETPLACE_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  PARTNER_KYC_STATUS_UPDATED: ['kycStatus'],
  PARTNER_LISTING_STATUS_UPDATED: ['listingId', 'listingTitle', 'listingStatus'],
  LISTING_PAYMENT_SUBMITTED: ['paymentId', 'listingId', 'listingTitle', 'paymentStatus'],
  LISTING_PAYMENT_APPROVED: ['paymentId', 'listingId', 'listingTitle', 'paymentStatus'],
  LISTING_PAYMENT_REJECTED: ['paymentId', 'listingId', 'listingTitle', 'paymentStatus'],
  CUSTOMER_PRIME_APPROVED: ['subscriptionId', 'status', 'customerName'],
  CUSTOMER_PRIME_REJECTED: ['status', 'customerName'],
  MARKETPLACE_NEW_LISTING_PUBLISHED: ['listingId', 'vehicleShortTitle', 'listingStatus'],
  MARKETPLACE_NEW_PAYMENT_SUPERADMIN: ['listingTitle', 'method'],
  MARKETPLACE_KYC_SUBMITTED_SUPERADMIN: ['partnerId'],
};

const getTextValue = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const getPayloadValue = (variable: string, payload: Record<string, unknown>) => {
  if (variable === 'status') return payload.status ?? payload.paymentStatus;
  if (variable === 'paymentStatus') return payload.paymentStatus ?? payload.status;
  if (variable === 'recipientRole') return payload.recipientRole ?? payload.recipientType;
  return payload[variable];
};

const bodyVariableCount = (components: unknown) => {
  if (!Array.isArray(components)) return 0;
  const body = components.find((component): component is { type?: unknown; text?: unknown } => (
    typeof component === 'object'
    && component !== null
    && (component as { type?: unknown }).type === 'BODY'
  ));
  if (typeof body?.text !== 'string') return 0;
  const indexes = [...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
  return indexes.length ? Math.max(...indexes) : 0;
};

export const getMarketplaceTemplateComponents = (
  eventCode: string,
  payloadSnapshot: Record<string, unknown>,
  templateComponents: unknown,
) => {
  const count = bodyVariableCount(templateComponents);
  const variables = MARKETPLACE_TEMPLATE_VARIABLES[eventCode] || [];
  if (!count || !variables.length) return [];

  return [{
    type: 'body',
    parameters: Array.from({ length: count }, (_, index) => {
      const variable = variables[index];
      return { type: 'text', text: getTextValue(variable ? getPayloadValue(variable, payloadSnapshot) : null, '-') };
    }),
  }];
};
