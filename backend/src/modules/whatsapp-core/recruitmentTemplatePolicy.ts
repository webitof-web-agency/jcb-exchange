const RECRUITMENT_TEMPLATE_VARIABLES: Record<string, readonly string[]> = {
  RECRUITMENT_APPLICATION_RECEIVED: ['candidateName', 'applicationRef', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_NEW_APPLICATION_RECRUITER: ['applicationRef', 'candidateName', 'jobId', 'jobTitle'],
  RECRUITMENT_APPLICATION_STAGE_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'stage'],
  RECRUITMENT_INTERVIEW_SCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType'],
  RECRUITMENT_INTERVIEW_RESCHEDULED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_INTERVIEW_CANCELLED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'scheduledAt', 'interviewType', 'status'],
  RECRUITMENT_OFFER_SENT: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'designation'],
  RECRUITMENT_OFFER_STATUS_UPDATED: ['candidateName', 'applicationId', 'applicationRef', 'jobTitle', 'offerStatus'],
  RECRUITMENT_NEW_JOB_PUBLISHED: ['jobId', 'jobCode', 'jobTitle', 'jobSlug', 'locationCity', 'locationState'],
};

const getTextValue = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

export const getRecruitmentTemplateComponents = (eventCode: string, payloadSnapshot: Record<string, unknown>) => {
  const variables = RECRUITMENT_TEMPLATE_VARIABLES[eventCode] || [];
  if (!variables.length) return [];
  return [{
    type: 'body',
    parameters: variables.map((variable) => ({ type: 'text', text: getTextValue(payloadSnapshot[variable], variable) })),
  }];
};
