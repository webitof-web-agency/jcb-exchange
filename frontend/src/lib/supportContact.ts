const getPhoneDigits = (value?: string | null) => String(value || '').replace(/\D/g, '');

const getInternationalDigits = (value?: string | null) => {
  const digits = getPhoneDigits(value);
  if (!digits) {
    return '';
  }

  return digits.length === 10 ? `91${digits}` : digits;
};

export const getDialHref = (value?: string | null) => {
  const internationalDigits = getInternationalDigits(value);
  return internationalDigits ? `tel:+${internationalDigits}` : null;
};

export const getWhatsAppHref = (value?: string | null) => {
  const internationalDigits = getInternationalDigits(value);
  return internationalDigits ? `https://wa.me/${internationalDigits}` : null;
};
