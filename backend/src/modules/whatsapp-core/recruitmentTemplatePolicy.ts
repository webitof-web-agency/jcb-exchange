import {
  buildUrlButtonParameter,
  findDynamicUrlButtons,
  getTemplateBodyVariableCount,
  getTemplateHeaderFormat,
  getTemplateHeaderTextVariableCount,
  isTemplateDefinitionKnown,
} from './metaTemplateDefinition';

/**
 * Body variable order of each recruitment template: entry n is {{n+1}}. Templates approved by Meta depend on this
 * order, so a variable is only ever appended at the end, never inserted in the middle.
 *
 * RECRUITMENT_OFFER_SENT: {{1}} candidate name, {{2}} application id, {{3}} application ref, {{4}} job title,
 *   {{5}} designation, {{6}} offer link (the short https://<site>/o/<code> link, the long signed link when no short
 *   link exists), {{7}} reply-before date. The offer letter PDF goes in the DOCUMENT header; a URL button
 *   https://<site>/o/{{1}} gets the short code.
 * RECRUITMENT_OFFER_ACCEPTED (candidate) and RECRUITMENT_OFFER_ACCEPTED_HR (internal alert): {{1}} candidate name,
 *   {{2}} job title, {{3}} designation, {{4}} application ref, {{5}} accepted on, {{6}} joining date.
 * RECRUITMENT_JOINING_REMINDER (internal): {{1}} employee name, {{2}} employee code, {{3}} designation,
 *   {{4}} joining date, {{5}} office, {{6}} state, {{7}} missing checklist items, {{8}} onboarding page link.
 * RECRUITMENT_JOINING_WELCOME (new employee): {{1}} employee name, {{2}} employee code, {{3}} designation,
 *   {{4}} joining date, {{5}} office, {{6}} login email.
 */
const RECRUITMENT_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  RECRUITMENT_APPLICATION_RECEIVED: ['candidateName', 'applicationRef', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_RECRUITER: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_APPLICATION_STAGE_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'stage'],
  RECRUITMENT_INTERVIEW_SCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_RESCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_CANCELLED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_OFFER_SENT: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation', 'offerLinkUrl', 'offerValidUntil'],
  RECRUITMENT_OFFER_STATUS_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'offerStatus'],
  RECRUITMENT_OFFER_ACCEPTED: ['candidateName', 'jobTitle', 'designation', 'applicationRef', 'acceptedOn', 'joiningDate'],
  RECRUITMENT_OFFER_ACCEPTED_HR: ['candidateName', 'jobTitle', 'designation', 'applicationRef', 'acceptedOn', 'joiningDate'],
  RECRUITMENT_JOINING_REMINDER: ['employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName', 'stateName', 'missingItems', 'onboardingUrl'],
  RECRUITMENT_JOINING_WELCOME: ['employeeName', 'employeeCode', 'designation', 'joiningDate', 'officeName', 'loginEmail'],
  RECRUITMENT_NEW_JOB_PUBLISHED: ['jobId', 'jobCode', 'jobTitle', 'locationCity', 'locationState'],
};

export const getRecruitmentTemplateVariables = (eventCode: string): readonly string[] => RECRUITMENT_TEMPLATE_VARIABLES[eventCode] || [];

const OFFER_SENT = 'RECRUITMENT_OFFER_SENT';
const OFFER_ACCEPTED = 'RECRUITMENT_OFFER_ACCEPTED';
// Offer templates approved before the offer link existed have five body variables and no button; they keep working
// (the link then reaches the candidate by email / SMS only).
const LEGACY_OFFER_BODY_VARIABLES = 5;
const OFFER_LINK_BODY_POSITION = 6;

const getTextValue = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const DATE_VARIABLES = new Set(['offerValidUntil', 'joiningDate', 'acceptedOn']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** YYYY-MM-DD -> "05 Dec 2026" (no time zone shift: the date is a calendar day). Other values are returned as they are. */
export const formatRecruitmentTemplateDate = (value: unknown) => {
  const text = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : text;
};

const recruitmentVariableValue = (variable: string, payload: Record<string, unknown>): unknown => {
  // Position 6 of the offer template: approved 6-variable templates show whichever link exists.
  if (variable === 'offerLinkUrl') return getTextValue(payload.offerShortUrl, '') || payload.offerResponseUrl;
  if (DATE_VARIABLES.has(variable)) return formatRecruitmentTemplateDate(payload[variable]);
  return payload[variable];
};

// Without a synced definition the count is a guess: offers keep the five values they always sent.
const defaultBodyVariableCount = (eventCode: string, variables: readonly string[]) =>
  eventCode === OFFER_SENT ? LEGACY_OFFER_BODY_VARIABLES : variables.length;

export const getRecruitmentTemplateComponents = (
  eventCode: string,
  payloadSnapshot: Record<string, unknown>,
  templateComponents?: unknown,
) => {
  const variables = RECRUITMENT_TEMPLATE_VARIABLES[eventCode] || [];
  if (!variables.length) return [];
  const count = getTemplateBodyVariableCount(templateComponents) ?? defaultBodyVariableCount(eventCode, variables);
  const components: Array<Record<string, unknown>> = [];
  // A body without variables gets no body component: Meta wants parameters only for the placeholders it declares.
  if (count > 0) {
    components.push({
      type: 'body',
      parameters: Array.from({ length: count }, (_, index) => {
        const variable = variables[index];
        return { type: 'text', text: getTextValue(variable ? recruitmentVariableValue(variable, payloadSnapshot) : null, '-') };
      }),
    });
  }
  if (eventCode === OFFER_SENT) {
    // https://<site>/o/{{1}}: the button gets the short code, whatever the body has.
    for (const button of findDynamicUrlButtons(templateComponents)) {
      components.push(buildUrlButtonParameter(button.index, getTextValue(payloadSnapshot.offerShortCode, '-')));
    }
  }
  return components;
};

export type RecruitmentTemplateCheck = { ok: true } | { ok: false; error: string };

/** Events whose template shape is checked when the rule is saved and again before each message is queued. */
// The HR alert is checked like the candidate confirmation: HR may well pick the same template for both.
export const recruitmentEventsWithTemplateChecks: readonly string[] = [OFFER_SENT, OFFER_ACCEPTED, 'RECRUITMENT_OFFER_ACCEPTED_HR', 'RECRUITMENT_JOINING_REMINDER', 'RECRUITMENT_JOINING_WELCOME'];
const PLAIN_EVENTS = new Set<string>(['RECRUITMENT_JOINING_REMINDER', 'RECRUITMENT_JOINING_WELCOME']);
const ACCEPTED_EVENTS = new Set<string>([OFFER_ACCEPTED, 'RECRUITMENT_OFFER_ACCEPTED_HR']);

const SHORT_LINK_BUTTON = /\/o\/\{\{\s*1\s*\}\}\s*$/i;

const checkOfferSentTemplate = (components: unknown): RecruitmentTemplateCheck => {
  // A template registered by hand (never synced) cannot be checked; it is sent as before (document + five values).
  if (!isTemplateDefinitionKnown(components)) return { ok: true };
  if (getTemplateHeaderFormat(components) !== 'DOCUMENT') {
    return { ok: false, error: 'The offer template needs a DOCUMENT header: the offer letter PDF is attached there.' };
  }
  const maxVariables = RECRUITMENT_TEMPLATE_VARIABLES[OFFER_SENT]!.length;
  const bodyCount = getTemplateBodyVariableCount(components) ?? 0;
  if (bodyCount > maxVariables) {
    return { ok: false, error: `The offer template uses {{${bodyCount}}}, but only {{1}} to {{${maxVariables}}} are filled.` };
  }
  const buttons = findDynamicUrlButtons(components);
  if (buttons.some((button) => !SHORT_LINK_BUTTON.test(button.url))) {
    return { ok: false, error: 'The offer template\'s URL button must be https://<public site>/o/{{1}}: the short offer code is filled in.' };
  }
  // A template without a URL button or a {{${OFFER_LINK_BODY_POSITION}}} link variable still sends (letter + its values), as
  // approved templates did before short links; the candidate then opens the offer from the email / SMS link.
  return { ok: true };
};

const checkOfferAcceptedTemplate = (components: unknown): RecruitmentTemplateCheck => {
  // Whether the certificate is attached depends on the header, so the definition must be known.
  if (!isTemplateDefinitionKnown(components)) {
    return { ok: false, error: 'Sync the Meta templates first: the acceptance template\'s header and body must be known.' };
  }
  const header = getTemplateHeaderFormat(components);
  if (header !== null && header !== 'DOCUMENT' && header !== 'TEXT') {
    return { ok: false, error: 'The acceptance template\'s header must be a DOCUMENT (the acceptance certificate) or none.' };
  }
  if (getTemplateHeaderTextVariableCount(components) > 0) {
    return { ok: false, error: 'The acceptance template\'s text header must not use variables.' };
  }
  const maxVariables = RECRUITMENT_TEMPLATE_VARIABLES[OFFER_ACCEPTED]!.length;
  const bodyCount = getTemplateBodyVariableCount(components) ?? 0;
  if (bodyCount > maxVariables) {
    return { ok: false, error: `The acceptance template uses {{${bodyCount}}}, but only {{1}} to {{${maxVariables}}} are filled.` };
  }
  if (findDynamicUrlButtons(components).length) {
    return { ok: false, error: 'The acceptance template has a URL button with {{1}}, which this message cannot fill.' };
  }
  return { ok: true };
};

/** Joining messages fill only body text: no document header, no header or URL-button variables. */
const checkPlainTemplate = (eventCode: string, components: unknown): RecruitmentTemplateCheck => {
  if (!isTemplateDefinitionKnown(components)) return { ok: true };
  const header = getTemplateHeaderFormat(components);
  if (header !== null && header !== 'TEXT') return { ok: false, error: 'This template must have no media header (only text is filled in).' };
  if (getTemplateHeaderTextVariableCount(components) > 0) return { ok: false, error: 'The text header of this template must not use variables.' };
  const maxVariables = RECRUITMENT_TEMPLATE_VARIABLES[eventCode]!.length;
  const bodyCount = getTemplateBodyVariableCount(components) ?? 0;
  if (bodyCount > maxVariables) return { ok: false, error: `This template uses {{${bodyCount}}}, but only {{1}} to {{${maxVariables}}} are filled.` };
  if (findDynamicUrlButtons(components).length) return { ok: false, error: 'This template has a URL button with {{1}}, which this message cannot fill.' };
  return { ok: true };
};

/** Checks the synced Meta definition of the template chosen for a recruitment event (other events: always ok). */
export const validateRecruitmentTemplate = (eventCode: string, components: unknown): RecruitmentTemplateCheck => {
  if (eventCode === OFFER_SENT) return checkOfferSentTemplate(components);
  if (ACCEPTED_EVENTS.has(eventCode)) return checkOfferAcceptedTemplate(components);
  if (PLAIN_EVENTS.has(eventCode)) return checkPlainTemplate(eventCode, components);
  return { ok: true };
};

export type RecruitmentTemplateDocument =
  | { ok: true; document: { url: string; fileName: string } | null }
  | { ok: false; error: string };

/**
 * The file sent in the DOCUMENT header (a secure Drive URL, fetched with the service account at delivery), or null
 * when the message has none. The offer always carries its letter; the acceptance message carries the certificate
 * only when its template has a DOCUMENT header, and is not sent when that header has no certificate to show.
 */
export const resolveRecruitmentTemplateDocument = (
  eventCode: string,
  templateComponents: unknown,
  payload: Record<string, unknown>,
): RecruitmentTemplateDocument => {
  if (eventCode === OFFER_SENT) {
    const url = getTextValue(payload.offerLetterUrl, '');
    if (!url) return { ok: false, error: 'The offer letter PDF is unavailable for WhatsApp.' };
    return { ok: true, document: { url, fileName: getTextValue(payload.offerLetterFileName, 'Offer_Letter.pdf') } };
  }
  if (ACCEPTED_EVENTS.has(eventCode) && getTemplateHeaderFormat(templateComponents) === 'DOCUMENT') {
    const url = getTextValue(payload.acceptanceDocumentUrl, '');
    if (!url) return { ok: false, error: 'The acceptance certificate is not available, and the WhatsApp template needs it in its DOCUMENT header.' };
    return { ok: true, document: { url, fileName: getTextValue(payload.acceptanceDocumentFileName, 'Offer_Acceptance.pdf') } };
  }
  return { ok: true, document: null };
};
