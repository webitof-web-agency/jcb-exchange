import prisma from '../src/lib/prisma';
import { provisionAutomationRules } from '../src/services/notificationAutomationProvisioning.service';
import { marketplaceWhatsAppEvents, recruitmentWhatsAppEvents } from '../src/services/whatsappIntegration.service';
import { marketplaceSmsEvents, recruitmentSmsEvents } from '../src/services/smsIntegration.service';

const run = async () => {
  const [whatsAppEvents, smsEvents] = [
    [...marketplaceWhatsAppEvents, ...recruitmentWhatsAppEvents],
    [...marketplaceSmsEvents, ...recruitmentSmsEvents],
  ];

  // Creates only missing rules in the OFF state. It never sends a message and
  // never replaces an administrator's existing template/message selection.
  await Promise.all([
    provisionAutomationRules(prisma.whatsAppAutomationRule, whatsAppEvents),
    provisionAutomationRules(prisma.smsAutomationRule, smsEvents),
  ]);

  console.log(`Provisioned supported notification events: WhatsApp=${new Set(whatsAppEvents).size}, SMS=${new Set(smsEvents).size}.`);
};

run()
  .catch((error) => {
    console.error('Notification automation provisioning failed.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
