export type VehicleSaleInvoiceDeliveryInput = {
  customerName: string;
  vehicleTitle: string;
  registrationNumber: string;
  invoiceNumber: string;
  invoiceAmount: string;
  invoiceUrl: string;
};

export type VehicleSaleInvoiceDeliveryMessage = {
  payloadSnapshot: VehicleSaleInvoiceDeliveryInput;
  whatsappTemplateComponents: [{
    type: 'body';
    parameters: Array<{ type: 'text'; text: string }>;
  }];
};

/**
 * Keeps the SMS payload keys and WhatsApp body parameter order in one place.
 * The configured templates must use the same six values, with invoiceUrl last.
 */
export const buildVehicleSaleInvoiceDeliveryMessage = (
  input: VehicleSaleInvoiceDeliveryInput,
): VehicleSaleInvoiceDeliveryMessage => ({
  payloadSnapshot: input,
  whatsappTemplateComponents: [{
    type: 'body',
    parameters: [
      { type: 'text', text: input.customerName },
      { type: 'text', text: input.vehicleTitle },
      { type: 'text', text: input.registrationNumber },
      { type: 'text', text: input.invoiceNumber },
      { type: 'text', text: input.invoiceAmount },
      { type: 'text', text: input.invoiceUrl },
    ],
  }],
});

export const isVehicleSaleInvoiceResendable = (record: { invoiceNumber?: string | null }) =>
  Boolean(record.invoiceNumber?.trim());
