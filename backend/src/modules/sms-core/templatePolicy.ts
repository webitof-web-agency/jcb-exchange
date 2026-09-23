const SMS_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  PARTNER_KYC_STATUS_UPDATED: ['partnerId', 'kycStatus'],
  PARTNER_LISTING_STATUS_UPDATED: ['listingId', 'listingTitle', 'listingStatus'],
  LISTING_PAYMENT_SUBMITTED: ['paymentId', 'listingId', 'listingTitle', 'method'],
  LISTING_PAYMENT_APPROVED: ['paymentId', 'listingId', 'listingTitle', 'status', 'paymentStatus', 'recipientRole'],
  LISTING_PAYMENT_REJECTED: ['paymentId', 'listingId', 'listingTitle', 'status', 'paymentStatus', 'recipientRole'],
  CUSTOMER_PRIME_APPROVED: ['subscriptionId', 'status', 'customerName'],
  CUSTOMER_PRIME_REJECTED: ['subscriptionId', 'status', 'customerName'],
  MARKETPLACE_NEW_LISTING_PUBLISHED: ['listingId', 'listingTitle', 'vehicleShortTitle', 'listingStatus', 'sourceEntityType', 'sourceEntityId'],
  RECRUITMENT_APPLICATION_RECEIVED: ['candidateName', 'applicationRef', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_RECRUITER: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_APPLICATION_STAGE_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'stage'],
  RECRUITMENT_INTERVIEW_SCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType'],
  RECRUITMENT_INTERVIEW_RESCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_CANCELLED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_OFFER_SENT: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation'],
  RECRUITMENT_OFFER_STATUS_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'offerStatus'],
  RECRUITMENT_NEW_JOB_PUBLISHED: ['jobId', 'jobCode', 'jobTitle', 'jobSlug', 'locationCity', 'locationState', 'sourceEntityType', 'sourceEntityId'],
} as const;

const VARIABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export const getSmsTemplateVariableOptions = (eventCode: string) => [...(SMS_TEMPLATE_VARIABLES[eventCode] || [])];

export const validateSmsTemplateVariableOrder = (eventCode: string, template?: string | null) => {
  const normalized = template?.trim() || '';
  if (!normalized) return null;
  if (normalized.length > 1000) throw new Error('SMS variable mapping is too long.');

  const allowedVariables = new Set(getSmsTemplateVariableOptions(eventCode));
  if (!allowedVariables.size) throw new Error(`SMS variable mapping is not supported for event ${eventCode}.`);

  const variables = normalized.split('|').map((variable) => variable.trim());
  if (variables.some((variable) => !VARIABLE_NAME_PATTERN.test(variable))) {
    throw new Error('SMS variable mapping must contain field names separated by |.');
  }
  const unsupported = variables.find((variable) => !allowedVariables.has(variable));
  if (unsupported) {
    throw new Error(`Unsupported SMS template variable: ${unsupported}. Allowed values: ${[...allowedVariables].join(', ')}.`);
  }
  return variables.join('|');
};

const serializeSmsVariable = (value: unknown) => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
};

export const getMissingSmsTemplateVariables = (template: string | null | undefined, payload: Record<string, unknown>) => {
  if (!template?.trim()) return [];
  return template.split('|').map((part) => part.trim()).filter(Boolean).filter((key) => !serializeSmsVariable(payload[key]));
};

export const renderSmsVariables = (template: string | null | undefined, payload: Record<string, unknown>) => {
  if (!template?.trim()) return '';
  return template.split('|').map((part) => serializeSmsVariable(payload[part.trim()])).join('|');
};
