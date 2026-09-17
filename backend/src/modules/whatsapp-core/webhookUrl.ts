const webhookPath = '/api/whatsapp/webhook';

export const buildWhatsAppWebhookUrl = (publicApiUrl: string) => {
  const url = new URL(publicApiUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('WhatsApp public API URL must use HTTP or HTTPS.');
  }
  url.search = '';
  url.hash = '';
  const basePath = url.pathname.replace(/\/+$/, '');
  const apiPath = basePath.endsWith('/api') ? basePath : `${basePath}/api`;
  url.pathname = `${apiPath}${webhookPath.replace('/api', '')}`;
  return url.toString();
};
