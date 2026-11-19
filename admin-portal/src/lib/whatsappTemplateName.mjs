const WHATSAPP_TEMPLATE_NAME_PATTERN = /^[a-z0-9_]+$/;
const WHATSAPP_LANGUAGE_PATTERN = /^[a-z]{2}_[A-Z]{2}$/;

export function validateWhatsAppTemplateForm({ name, language, status, metaTemplateId }) {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > 512 || !WHATSAPP_TEMPLATE_NAME_PATTERN.test(trimmedName)) {
    return 'Template name must contain lowercase letters, numbers, and underscores only.';
  }

  if (!WHATSAPP_LANGUAGE_PATTERN.test(language.trim())) {
    return 'Language must use the format en_US.';
  }

  if (status.trim().toUpperCase() === 'APPROVED' && !metaTemplateId.trim()) {
    return 'An approved template requires its Meta template ID.';
  }

  return null;
}

export function canRegisterWhatsAppTemplate(form) {
  return Boolean(form.name.trim()) && validateWhatsAppTemplateForm(form) === null;
}
