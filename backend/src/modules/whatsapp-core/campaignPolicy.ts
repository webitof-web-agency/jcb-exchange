export const canConfirmWhatsAppCampaign = ({ status, recipientCount }: { status: string; recipientCount: number }) =>
  status === 'DRAFT' && recipientCount > 0;
