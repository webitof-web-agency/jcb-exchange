/**
 * Meta WhatsApp template contract for CRM_LEAD_ACKNOWLEDGEMENT.
 * This event is text-only: the CRM sender supplies two body parameters and
 * does not attach a PDF/document header.
 */
export const CRM_LEAD_ACKNOWLEDGEMENT_WHATSAPP_TEMPLATE = {
  name: 'marketplace_crm_lead_acknowledgement',
  language: 'en_US',
  category: 'MARKETPLACE',
  body: 'Hello {{1}},\n\nThank you for contacting JCB Exchange.\nWe have received your enquiry about {{2}}.\nOur team will contact you shortly.\n\nThank you for choosing JCB Exchange.',
  footer: 'JCB Exchange',
  bodyVariableCount: 2,
} as const;
