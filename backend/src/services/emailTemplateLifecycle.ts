export type EmailTemplateDeletePlanInput = {
  templateId: string;
  eventCode: string;
  fallbackTemplateId: string | null;
  currentRule?: {
    enabled: boolean;
    templateId: string | null;
  };
};

export const buildEmailTemplateDeletePlan = ({
  templateId,
  eventCode,
  fallbackTemplateId,
  currentRule,
}: EmailTemplateDeletePlanInput) => {
  const shouldFallback = !currentRule || currentRule.templateId === templateId;

  return {
  template: { archived: true, enabled: false },
  rule: {
    eventCode,
    templateId: shouldFallback ? fallbackTemplateId : currentRule.templateId,
    enabled: currentRule?.enabled ?? true,
  },
  };
};
