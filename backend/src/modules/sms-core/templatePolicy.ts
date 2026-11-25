import { messageVariableValue } from '../../utils/messageDisplayValues';

const SMS_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  PARTNER_KYC_STATUS_UPDATED: ['partnerId', 'kycStatus'],
  PARTNER_LISTING_STATUS_UPDATED: ['listingId', 'listingTitle', 'listingStatus'],
  LISTING_PAYMENT_SUBMITTED: ['paymentId', 'listingId', 'listingTitle', 'method'],
  LISTING_PAYMENT_APPROVED: ['paymentId', 'listingId', 'listingTitle', 'status', 'paymentStatus', 'recipientRole'],
  LISTING_PAYMENT_REJECTED: ['paymentId', 'listingId', 'listingTitle', 'status', 'paymentStatus', 'recipientRole'],
  CUSTOMER_PRIME_APPROVED: ['subscriptionId', 'status', 'customerName'],
  CUSTOMER_PRIME_REJECTED: ['subscriptionId', 'status', 'customerName'],
  MARKETPLACE_NEW_LISTING_PUBLISHED: ['listingId', 'listingTitle', 'vehicleShortTitle', 'listingStatus', 'sourceEntityType', 'sourceEntityId'],
  VEHICLE_SALE_INVOICE: ['customerName', 'vehicleTitle', 'registrationNumber', 'invoiceNumber', 'invoiceAmount', 'invoiceUrl'],
  VEHICLE_SALE_PAYMENT_RECEIPT: ['customerName', 'vehicleTitle', 'amount', 'receiptNumber', 'balance', 'paymentMethod', 'receiptUrl'],
  CRM_LEAD_ACKNOWLEDGEMENT: ['customerName', 'enquiry'],
  CRM_LEAD_ASSIGNED: ['staffName', 'customerName', 'customerMobile', 'enquiry'],
  CRM_FOLLOW_UP_REMINDER: ['staffName', 'customerName', 'followUpType', 'dueAt', 'customerMobile'],
  CRM_APPOINTMENT_REMINDER: ['customerName', 'followUpType', 'dueAt'],
  CRM_MATCHING_LISTING: ['customerName', 'listingTitle', 'listingPrice', 'listingUrl'],
  CRM_REENGAGEMENT: ['customerName', 'enquiry'],
  RECRUITMENT_APPLICATION_RECEIVED: ['candidateName', 'applicationRef', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_RECRUITER: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_APPLICATION_STAGE_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'stage'],
  RECRUITMENT_INTERVIEW_SCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType'],
  RECRUITMENT_INTERVIEW_RESCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_CANCELLED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_OFFER_SENT: [
    'candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation',
    'offerResponseUrl', 'offerShortUrl', 'offerShortCode', 'offerValidUntil', 'joiningDate',
  ],
  RECRUITMENT_OFFER_STATUS_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'offerStatus'],
  // The accepted / joining messages carry no offer link: the offer is answered, nothing is left to open or sign.
  RECRUITMENT_OFFER_ACCEPTED: ['candidateName', 'applicationRef', 'jobTitle', 'designation', 'joiningDate', 'acceptedOn'],
  RECRUITMENT_OFFER_ACCEPTED_HR: ['candidateName', 'applicationRef', 'jobTitle', 'designation', 'joiningDate', 'acceptedOn'],
  // missingItemsShort ('3 items pending'): the full list does not fit a ~30-character DLT variable.
  RECRUITMENT_JOINING_REMINDER: ['employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName', 'stateName', 'missingItemsShort'],
  RECRUITMENT_JOINING_WELCOME: ['employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName'],
  RECRUITMENT_NEW_JOB_PUBLISHED: ['jobId', 'jobCode', 'jobTitle', 'jobSlug', 'locationCity', 'locationState', 'sourceEntityType', 'sourceEntityId'],
} as const;

/**
 * A DLT {#var#} value holds about 30 characters, so the long signed offer link (offerResponseUrl, ~150 characters)
 * does not fit, and even https://<site>/o/<code> (offerShortUrl) is over 30 with most domains. The recommended
 * approved text writes the fixed prefix in the template and sends only the 8-character code:
 *   'Dear {#var#}, your offer for {#var#} is ready. View & sign: https://<site>/o/{#var#} - JCB Exchange'
 * with the variable order candidateName|jobTitle|offerShortCode.
 * offerResponseUrl is still accepted so a rule saved before short links existed keeps sending.
 */
export const DLT_VARIABLE_MAX_LENGTH = 30;
export const OFFER_SMS_LINK_VARIABLES = ['offerShortCode', 'offerShortUrl', 'offerResponseUrl'] as const;

const REQUIRED_SMS_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  VEHICLE_SALE_INVOICE: ['customerName', 'vehicleTitle', 'registrationNumber', 'invoiceNumber', 'invoiceAmount', 'invoiceUrl'],
  VEHICLE_SALE_PAYMENT_RECEIPT: ['customerName', 'vehicleTitle', 'amount', 'receiptNumber', 'balance', 'paymentMethod', 'receiptUrl'],
};


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

/** The offer link variables a template uses, in template order. */
export const getOfferSmsLinkVariables = (template?: string | null) => {
  const used = (template || '').split('|').map((variable) => variable.trim());
  return used.filter((variable): variable is (typeof OFFER_SMS_LINK_VARIABLES)[number] =>
    (OFFER_SMS_LINK_VARIABLES as readonly string[]).includes(variable));
};

/**
 * requireOfferLink: when HR saves or switches on an offer rule it must carry one link variable. The same check runs
 * again before every send with requireOfferLink false: offer rules switched on before short links existed (approved
 * DLT text without a link, e.g. candidateName|jobTitle) must keep sending instead of stopping silently.
 */
export const validateSmsTemplateConfiguration = (
  eventCode: string,
  enabled: boolean,
  template?: string | null,
  options: { requireOfferLink?: boolean } = {},
) => {
  const normalized = validateSmsTemplateVariableOrder(eventCode, template);
  if (enabled && (options.requireOfferLink ?? true) && eventCode === 'RECRUITMENT_OFFER_SENT' && !getOfferSmsLinkVariables(normalized).length) {
    throw new Error('SMS offer template must include offerShortCode, offerShortUrl or offerResponseUrl so the candidate can securely review the offer.');
  }
  const required = REQUIRED_SMS_TEMPLATE_VARIABLES[eventCode] || null;
  if (enabled && required && normalized !== required.join('|')) {
    throw new Error(`SMS template for ${eventCode} must use this exact variable order: ${required.join('|')}.`);
  }
  return normalized;
};


const serializeSmsVariable = (value: unknown) => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
};

/**
 * Values that may legitimately be blank (no reply-by date, no office yet...). A blank one is sent as '-' instead of
 * failing the SMS on every retry; every other blank value still stops the send (it would be a broken message).
 */
export const OPTIONAL_SMS_VARIABLES = new Set(['offerValidUntil', 'joiningDate', 'designation', 'officeName', 'stateName', 'acceptedOn']);
const BLANK_OPTIONAL_VALUE = '-';

export const getMissingSmsTemplateVariables = (template: string | null | undefined, payload: Record<string, unknown>) => {
  if (!template?.trim()) return [];
  return template.split('|').map((part) => part.trim()).filter(Boolean)
    .filter((key) => !OPTIONAL_SMS_VARIABLES.has(key) && !serializeSmsVariable(messageVariableValue(key, payload)));
};

export const renderSmsVariables = (template: string | null | undefined, payload: Record<string, unknown>) => {
  if (!template?.trim()) return '';
  return template.split('|').map((part) => {
    const key = part.trim();
    const value = serializeSmsVariable(messageVariableValue(key, payload));
    return value || (OPTIONAL_SMS_VARIABLES.has(key) ? BLANK_OPTIONAL_VALUE : '');
  }).join('|');
};
