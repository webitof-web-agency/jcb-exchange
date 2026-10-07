export const getWhatsAppCredentialFieldState = (value: string, configured: boolean) => ({
  showConfigured: !value.trim() && configured,
  showToggle: Boolean(value),
});

export type WhatsAppCredentialValues = {
  accessToken?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
};

export const mergeRevealedWhatsAppCredentials = <T extends {
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
}>(form: T, credentials: WhatsAppCredentialValues): T => ({
  ...form,
  ...(credentials.accessToken !== undefined ? { accessToken: credentials.accessToken } : {}),
  ...(credentials.webhookVerifyToken !== undefined ? { webhookVerifyToken: credentials.webhookVerifyToken } : {}),
  ...(credentials.appSecret !== undefined ? { appSecret: credentials.appSecret } : {}),
});

export const preserveWhatsAppCredentialsAfterSave = <T extends {
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
  testRecipientPhone: string;
}>(form: T): T => ({
  ...form,
  testRecipientPhone: '',
});
