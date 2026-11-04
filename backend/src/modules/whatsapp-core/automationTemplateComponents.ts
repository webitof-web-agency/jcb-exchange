import { getMarketplaceTemplateComponents } from './marketplaceTemplatePolicy';
import { getRecruitmentTemplateComponents } from './recruitmentTemplatePolicy';

export const getAutomationTemplateComponents = (
  eventCode: string,
  payloadSnapshot: Record<string, unknown>,
  explicitComponents?: unknown,
  templateDefinitionComponents?: unknown,
) => {
  if (explicitComponents !== undefined && explicitComponents !== null) return explicitComponents;
  return eventCode.startsWith('RECRUITMENT_')
    ? getRecruitmentTemplateComponents(eventCode, payloadSnapshot, templateDefinitionComponents)
    : getMarketplaceTemplateComponents(eventCode, payloadSnapshot, templateDefinitionComponents);
};
