const TEMPLATE_UPLOADS = {
  aadhaar: { route: 'aadhaar-verification', marker: 'maskedAadhaar', mimeType: 'image/png', extension: 'png' },
  pan: { route: 'pan-verification', marker: 'maskedPan', mimeType: 'image/png', extension: 'png' },
  gst: { route: 'gst-verification', marker: 'maskedGstin', mimeType: 'application/pdf', extension: 'pdf' },
};

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const getVerificationTemplateUpload = (kind, preview) => {
  const config = TEMPLATE_UPLOADS[kind];
  const record = isObject(preview?.response?.record) ? preview.response.record : null;
  const recordId = typeof record?.id === 'string' ? record.id.trim() : '';
  const marker = config && typeof record?.[config.marker] === 'string' ? record[config.marker].trim() : '';
  if (!config || !recordId || !marker) return null;

  return {
    recordId,
    endpoint: `/${config.route}/${encodeURIComponent(recordId)}/template`,
    mimeType: config.mimeType,
    extension: config.extension,
  };
};
