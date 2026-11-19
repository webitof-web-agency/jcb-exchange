/**
 * Meta WhatsApp template contract for VEHICLE_SALE_PAYMENT_RECEIPT.
 * The runtime attaches the generated Money Receipt PDF as the DOCUMENT header,
 * then sends seven body parameters in the order defined here.
 */
export const VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE = {
  name: 'marketplace_vehicle_payment_receipt',
  language: 'en_US',
  category: 'MARKETPLACE',
  header: { type: 'DOCUMENT' },
  body: 'Hello {{1}},\n\nPayment received for your vehicle purchase.\nVehicle: {{2}}\nPaid: {{3}}\nReceipt no.: {{4}}\nBalance due: {{5}}\nPayment method: {{6}}\n\nDownload receipt: {{7}}\n\nThank you for choosing JCB Exchange.',
  footer: 'JCB Exchange',
  bodyVariableCount: 7,
} as const;

export const buildVehicleSalePaymentReceiptWhatsAppTemplateComponents = (bodyText?: string | null) => [
  { type: 'HEADER', format: 'DOCUMENT' },
  {
    type: 'BODY',
    text: bodyText?.trim() || VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE.body,
  },
];

export type VehicleSalePaymentReceiptWhatsAppTemplate = {
  name?: string | null;
  components?: unknown;
};

/** Validate the Meta template shape required by the generated receipt PDF sender. */
export const validateVehicleSalePaymentReceiptWhatsAppTemplate = (
  template: VehicleSalePaymentReceiptWhatsAppTemplate,
) => {
  if (template.name !== VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE.name) {
    throw new Error(`Payment receipt WhatsApp template must be named ${VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE.name}.`);
  }
  if (!Array.isArray(template.components)) {
    throw new Error('Payment receipt WhatsApp template components are missing. Sync the approved Meta template first.');
  }

  const header = template.components.find((component) => (
    typeof component === 'object'
    && component !== null
    && String((component as { type?: unknown }).type || '').toUpperCase() === 'HEADER'
  )) as { format?: unknown } | undefined;
  if (String(header?.format || '').toUpperCase() !== 'DOCUMENT') {
    throw new Error('Payment receipt WhatsApp template must have a DOCUMENT header for the generated PDF.');
  }

  const body = template.components.find((component) => (
    typeof component === 'object'
    && component !== null
    && String((component as { type?: unknown }).type || '').toUpperCase() === 'BODY'
  )) as { text?: unknown } | undefined;
  if (typeof body?.text !== 'string') throw new Error('Payment receipt WhatsApp template body is missing.');

  const indexes = [...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
  const expected = Array.from({ length: VEHICLE_SALE_PAYMENT_RECEIPT_WHATSAPP_TEMPLATE.bodyVariableCount }, (_, index) => index + 1);
  if (indexes.length !== expected.length || indexes.some((value, index) => value !== expected[index])) {
    throw new Error(`Payment receipt WhatsApp template body must contain variables {{1}} through {{${expected.length}}} in order.`);
  }
  return true;
};
