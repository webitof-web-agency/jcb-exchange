import prisma from '../src/lib/prisma';
import { marketplaceWhatsAppEvents, recruitmentWhatsAppEvents } from '../src/services/whatsappIntegration.service';
import { marketplaceSmsEvents, recruitmentSmsEvents } from '../src/services/smsIntegration.service';
import { getAutomationTemplateComponents } from '../src/modules/whatsapp-core/automationTemplateComponents';

const run = async () => {
  const whatsappEvents = [...marketplaceWhatsAppEvents, ...recruitmentWhatsAppEvents];
  const smsEvents = [...marketplaceSmsEvents, ...recruitmentSmsEvents];
  const [whatsappRules, smsRules] = await Promise.all([
    prisma.whatsAppAutomationRule.findMany({
      where: { eventCode: { in: whatsappEvents } },
      select: { eventCode: true, enabled: true, template: { select: { name: true, status: true, metaTemplateId: true, category: true, components: true } } },
    }),
    prisma.smsAutomationRule.findMany({
      where: { eventCode: { in: smsEvents } },
      select: { eventCode: true, enabled: true, messageId: true, variablesTemplate: true },
    }),
  ]);

  const whatsappByEvent = new Map(whatsappRules.map((rule) => [rule.eventCode, rule]));
  const smsByEvent = new Map(smsRules.map((rule) => [rule.eventCode, rule]));
  const enabledWhatsApp = whatsappRules.filter((rule) => rule.enabled);
  const enabledSms = smsRules.filter((rule) => rule.enabled);
  const bodyVariableCount = (components: unknown) => {
    if (!Array.isArray(components)) return 0;
    const body = components.find((component) => typeof component === 'object' && component !== null && (component as { type?: unknown }).type === 'BODY') as { text?: unknown } | undefined;
    return typeof body?.text === 'string' ? [...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].length : 0;
  };
  const bodyText = (components: unknown) => {
    if (!Array.isArray(components)) return null;
    const body = components.find((component) => typeof component === 'object' && component !== null && (component as { type?: unknown }).type === 'BODY') as { text?: unknown } | undefined;
    return typeof body?.text === 'string' ? body.text : null;
  };
  const generatedBodyVariableCount = (eventCode: string, components: unknown) => {
    const generated = getAutomationTemplateComponents(eventCode, {}, undefined, components);
    if (!Array.isArray(generated)) return 0;
    const body = generated.find((component) => typeof component === 'object' && component !== null && (component as { type?: unknown }).type === 'body') as { parameters?: unknown } | undefined;
    return Array.isArray(body?.parameters) ? body.parameters.length : 0;
  };

  console.log(JSON.stringify({
    whatsapp: {
      supported: whatsappEvents.length,
      configured: whatsappRules.length,
      missing: whatsappEvents.filter((eventCode) => !whatsappByEvent.has(eventCode)),
      enabled: enabledWhatsApp.length,
      enabledInvalid: enabledWhatsApp
        .filter((rule) => !rule.template || rule.template.status !== 'APPROVED' || !rule.template.metaTemplateId)
        .map((rule) => ({ eventCode: rule.eventCode, template: rule.template })),
      enabledPlaceholderMismatch: enabledWhatsApp
        .filter((rule) => rule.template && bodyVariableCount(rule.template.components) !== generatedBodyVariableCount(rule.eventCode, rule.template.components))
        .map((rule) => ({ eventCode: rule.eventCode, template: rule.template?.name, expected: bodyVariableCount(rule.template?.components), generated: generatedBodyVariableCount(rule.eventCode, rule.template?.components) })),
      configuredRules: whatsappRules.map((rule) => ({ eventCode: rule.eventCode, enabled: rule.enabled, template: rule.template ? { name: rule.template.name, status: rule.template.status, category: rule.template.category, bodyVariableCount: bodyVariableCount(rule.template.components), bodyText: bodyText(rule.template.components) } : null })),
    },
    sms: {
      supported: smsEvents.length,
      configured: smsRules.length,
      missing: smsEvents.filter((eventCode) => !smsByEvent.has(eventCode)),
      enabled: enabledSms.length,
      enabledInvalid: enabledSms.filter((rule) => !rule.messageId).map((rule) => rule.eventCode),
      configuredRules: smsRules.map((rule) => ({ eventCode: rule.eventCode, enabled: rule.enabled, messageId: rule.messageId, variablesTemplate: rule.variablesTemplate })),
    },
  }, null, 2));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
