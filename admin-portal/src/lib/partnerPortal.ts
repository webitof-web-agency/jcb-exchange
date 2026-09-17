export const formatPortalLabel = (value?: string | null) => {
  if (!value) return '-';
  const valUpper = value.toUpperCase();
  if (valUpper === 'SHOWROOM') return 'Authorized Place';
  if (valUpper === 'DEALER') return 'Broker';
  if (valUpper === 'SUPER_ADMIN_WHATSAPP' || valUpper === 'SUPERADMIN_WHATSAPP') return 'Super Admin WhatsApp';
  if (valUpper === 'SUPER_ADMIN_CALL' || valUpper === 'SUPERADMIN_CALL') return 'Super Admin Call';
  if (valUpper === 'SUPER_ADMIN_CALLBACK' || valUpper === 'SUPERADMIN_CALLBACK') return 'Super Admin Callback';
  if (valUpper === 'SELLER_WHATSAPP' || valUpper === 'DEALER_WHATSAPP') return 'Seller WhatsApp';
  if (valUpper === 'SELLER_CALL' || valUpper === 'DEALER_CALL') return 'Seller Call';
  if (valUpper === 'SELLER_CALLBACK' || valUpper === 'DEALER_CALLBACK') return 'Seller Callback';
  
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const formatPortalCurrency = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export const formatPortalDateTime = (value?: string | Date | null) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  const dateStr = parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const timeStr = parsed.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateStr}, ${timeStr}`;
};

export const formatPortalDate = (value?: string | Date | null) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};
