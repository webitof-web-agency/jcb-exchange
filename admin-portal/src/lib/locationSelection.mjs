const hasLocationId = (value) => value !== null && value !== undefined && String(value).trim() !== '';

export const normalizeLocationOptions = (options) => {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.filter((option) => (
    option &&
    hasLocationId(option.id) &&
    typeof option.name === 'string' &&
    option.name.trim().length > 0
  ));
};

export const findLocationOptionId = (options, selectedName) => {
  const normalizedName = String(selectedName || '').trim().toLowerCase();
  if (!normalizedName) {
    return '';
  }

  const selectedOption = normalizeLocationOptions(options).find(
    (option) => option.name.trim().toLowerCase() === normalizedName,
  );

  return selectedOption ? String(selectedOption.id) : '';
};
