export const getPreferredWhatsAppNumber = (whatsappNumber?: string | null, mobile?: string | null) => {
  const preferred = whatsappNumber?.trim() || mobile?.trim() || '';
  return preferred || null;
};
