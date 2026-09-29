export type WhatsAppCloudApiConfig = {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
};

export const sendWhatsAppText = async (
  config: WhatsAppCloudApiConfig,
  to: string,
  body: string,
) => {
  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body } }),
    },
  );
  const result = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'Meta rejected the WhatsApp message.');
  return { metaMessageId: result.messages?.[0]?.id || null };
};

export const sendWhatsAppTemplate = async (
  config: WhatsAppCloudApiConfig,
  to: string,
  template: { name: string; language: string; components?: unknown },
) => {
  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
          ...(Array.isArray(template.components) && template.components.length ? { components: template.components } : {}),
        },
      }),
    },
  );
  const result = await response.json().catch(() => ({})) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || 'Meta rejected the WhatsApp template message.');
  return { metaMessageId: result.messages?.[0]?.id || null };
};

export const uploadWhatsAppDocument = async (
  config: WhatsAppCloudApiConfig,
  file: Buffer,
  fileName: string,
) => {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  const pdfBytes = new Uint8Array(file.byteLength);
  pdfBytes.set(file);
  form.append('file', new Blob([pdfBytes.buffer], { type: 'application/pdf' }), fileName);

  const response = await fetch(
    `https://graph.facebook.com/${encodeURIComponent(config.graphApiVersion)}/${encodeURIComponent(config.phoneNumberId)}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.accessToken}` },
      body: form,
    },
  );
  const result = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string } };
  if (!response.ok || !result.id) throw new Error(result.error?.message || 'Meta rejected the WhatsApp document upload.');
  return { mediaId: result.id };
};
