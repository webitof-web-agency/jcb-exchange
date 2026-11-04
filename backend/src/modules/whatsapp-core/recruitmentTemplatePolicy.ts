const RECRUITMENT_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  RECRUITMENT_APPLICATION_RECEIVED: ['candidateName', 'applicationRef', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_RECRUITER: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_APPLICATION_STAGE_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'stage'],
  RECRUITMENT_INTERVIEW_SCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_RESCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_CANCELLED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_OFFER_SENT: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation'],
  RECRUITMENT_OFFER_STATUS_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'offerStatus'],
  RECRUITMENT_NEW_JOB_PUBLISHED: ['jobId', 'jobCode', 'jobTitle', 'locationCity', 'locationState'],
};

const getTextValue = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
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

export const getRecruitmentTemplateComponents = (
  eventCode: string,
  payloadSnapshot: Record<string, unknown>,
  templateComponents?: unknown,
) => {
  const variables = RECRUITMENT_TEMPLATE_VARIABLES[eventCode] || [];
  if (!variables.length) return [];
  const count = bodyVariableCount(templateComponents) || variables.length;
  return [{
    type: 'body',
    parameters: Array.from({ length: count }, (_, index) => {
      const variable = variables[index];
      return { type: 'text', text: getTextValue(variable ? payloadSnapshot[variable] : null, '-') };
    }),
  }];
};
