/**
 * Shape every Vehicle Transport WhatsApp template must have, because the sender always attaches the
 * Delivery Challan PDF as a document header and fills five positional body variables:
 * {{1}} customer name, {{2}} machine title, {{3}} registration no., {{4}} challan no., {{5}} stage.
 */
export const VEHICLE_TRANSPORT_WHATSAPP_BODY_VARIABLES = 5;

type TemplateLike = { components?: unknown };

const findComponent = (components: unknown[], type: string) => components.find((component) => (
  typeof component === 'object'
  && component !== null
  && String((component as { type?: unknown }).type || '').toUpperCase() === type
)) as { format?: unknown; text?: unknown } | undefined;

export const validateVehicleTransportWhatsAppTemplate = (template: TemplateLike) => {
  if (!Array.isArray(template.components)) {
    throw new Error('Vehicle transport WhatsApp template components are missing. Sync the approved Meta template first.');
  }

  const header = findComponent(template.components, 'HEADER');
  if (String(header?.format || '').toUpperCase() !== 'DOCUMENT') {
    throw new Error('Vehicle transport WhatsApp template must have a DOCUMENT header for the Delivery Challan PDF.');
  }

  const body = findComponent(template.components, 'BODY');
  if (typeof body?.text !== 'string') throw new Error('Vehicle transport WhatsApp template body is missing.');

  const indexes = [...new Set([...body.text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
  const expected = Array.from({ length: VEHICLE_TRANSPORT_WHATSAPP_BODY_VARIABLES }, (_, index) => index + 1);
  if (indexes.length !== expected.length || indexes.some((value, index) => value !== expected[index])) {
    throw new Error(`Vehicle transport WhatsApp template body must use variables {{1}} through {{${expected.length}}}.`);
  }
};
