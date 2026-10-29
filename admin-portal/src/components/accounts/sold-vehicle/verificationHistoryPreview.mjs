export const hasPersistedVerificationPreview = (response) => {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return false;
  const result = response.result;
  const template = response.template || (response.record && response.record.template);
  return Boolean(
    result && typeof result === 'object' && !Array.isArray(result)
      || template && typeof template === 'object' && !Array.isArray(template),
  );
};
