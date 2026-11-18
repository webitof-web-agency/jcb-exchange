const VEHICLE_SALE_EVENTS = new Set([
  'VEHICLE_SALE_INVOICE',
  'VEHICLE_SALE_PAYMENT_RECEIPT',
]);

const VEHICLE_SALE_SMS_VARIABLES = Object.freeze({
  VEHICLE_SALE_INVOICE: 'customerName|vehicleTitle|registrationNumber|invoiceNumber|invoiceAmount|invoiceUrl',
  VEHICLE_SALE_PAYMENT_RECEIPT: 'customerName|vehicleTitle|amount|receiptNumber|balance|paymentMethod|receiptUrl',
});

const VEHICLE_SALE_WHATSAPP_TEMPLATES = Object.freeze({
  VEHICLE_SALE_INVOICE: 'marketplace_vehicle_sale_invoice',
  VEHICLE_SALE_PAYMENT_RECEIPT: 'marketplace_vehicle_payment_receipt',
});

export const shouldEnableVehicleSaleAutomationAfterSelection = (eventCode, selectedValue) => (
  VEHICLE_SALE_EVENTS.has(eventCode) && Boolean(String(selectedValue || '').trim())
);

export const defaultVehicleSaleSmsVariables = (eventCode) => VEHICLE_SALE_SMS_VARIABLES[eventCode] || '';

export const vehicleSaleWhatsAppTemplateName = (eventCode) => VEHICLE_SALE_WHATSAPP_TEMPLATES[eventCode] || '';
