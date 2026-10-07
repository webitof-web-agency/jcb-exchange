import { getPreferredWhatsAppNumber } from './whatsappRecipient';

export const buildCustomerPrimeWhatsAppDispatch = ({
  subscriptionId,
  status,
  customerName,
  whatsappNumber,
  mobile,
}: {
  subscriptionId: string;
  status: string;
  customerName?: string | null | undefined;
  whatsappNumber?: string | null | undefined;
  mobile?: string | null | undefined;
}) => {
  if (status !== 'ACTIVE') return null;

  const recipientPhone = getPreferredWhatsAppNumber(whatsappNumber, mobile);
  if (!recipientPhone) return null;

  return {
    eventCode: 'CUSTOMER_PRIME_APPROVED' as const,
    relatedEntityType: 'CUSTOMER_PRIME_SUBSCRIPTION' as const,
    relatedEntityId: subscriptionId,
    recipientType: 'CUSTOMER' as const,
    recipientPhone,
    payloadSnapshot: {
      subscriptionId,
      status,
      customerName: customerName || null,
    },
    templateComponents: [{
      type: 'body' as const,
      parameters: [
        { type: 'text' as const, text: subscriptionId },
        { type: 'text' as const, text: status },
        { type: 'text' as const, text: customerName?.trim() || 'Customer' },
      ],
    }],
  };
};
