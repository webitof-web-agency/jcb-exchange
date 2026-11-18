/**
 * The exact Meta WhatsApp template contract for VEHICLE_SALE_INVOICE.
 *
 * The runtime delivery code sends a DOCUMENT header containing the generated
 * Bill of Supply PDF, followed by six text body parameters in this order:
 * customer, vehicle, registration, invoice number, amount, public URL.
 */
export const VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE = {
  name: 'marketplace_vehicle_sale_invoice',
  language: 'en_US',
  category: 'MARKETPLACE',
  header: { type: 'DOCUMENT' },
  body: 'Hello {{1}},\n\nYour vehicle sale invoice is ready.\nVehicle: {{2}}\nRegistration: {{3}}\nInvoice no.: {{4}}\nAmount: {{5}}\n\nDownload invoice: {{6}}\n\nThank you for choosing JCB Exchange.',
  footer: 'JCB Exchange',
  bodyVariableCount: 6,
} as const;

export const buildVehicleSaleInvoiceWhatsAppTemplateComponents = (bodyText?: string | null) => [
  { type: 'HEADER', format: 'DOCUMENT' },
  {
    type: 'BODY',
    text: bodyText?.trim() || VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.body,
  },
];

export type VehicleSaleInvoiceWhatsAppTemplate = {
  name?: string | null;
  components?: unknown;
};

/** Validate the Meta template shape required by the generated invoice PDF sender. */
export const validateVehicleSaleInvoiceWhatsAppTemplate = (
  template: VehicleSaleInvoiceWhatsAppTemplate,
) => {
  if (template.name !== VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.name) {
    throw new Error(`Vehicle sale invoice WhatsApp template must be named ${VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.name}.`);
  }
  if (!Array.isArray(template.components)) {
    throw new Error('Vehicle sale invoice WhatsApp template components are missing. Sync the approved Meta template first.');
  }

  const header = template.components.find((component) => (
    typeof component === 'object'
    && component !== null
    && String((component as { type?: unknown }).type || '').toUpperCase() === 'HEADER'
  )) as { format?: unknown } | undefined;
  if (String(header?.format || '').toUpperCase() !== 'DOCUMENT') {
    throw new Error('Vehicle sale invoice WhatsApp template must have a DOCUMENT header for the generated PDF.');
  }

  const body = template.components.find((component) => (
    typeof component === 'object'
    && component !== null
    && String((component as { type?: unknown }).type || '').toUpperCase() === 'BODY'
  )) as { text?: unknown } | undefined;
  if (typeof body?.text !== 'string') throw new Error('Vehicle sale invoice WhatsApp template body is missing.');

  const indexes = [...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1]));
  const expected = Array.from({ length: VEHICLE_SALE_INVOICE_WHATSAPP_TEMPLATE.bodyVariableCount }, (_, index) => index + 1);
  if (indexes.length !== expected.length || indexes.some((value, index) => value !== expected[index])) {
    throw new Error(`Vehicle sale invoice WhatsApp template body must contain variables {{1}} through {{${expected.length}}} in order.`);
  }
  return true;
};
