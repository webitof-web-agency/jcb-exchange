export const getListingFormValidationError = ({ category, brand, imageCount, hasVideo }) => {
  if (!String(category || '').trim()) {
    return 'Category is required.';
  }

  if (!String(brand || '').trim()) {
    return 'Brand is required.';
  }

  if (imageCount < 1) {
    return 'At least one vehicle image is required.';
  }

  if (!hasVideo) {
    return 'A vehicle video is required.';
  }

  return null;
};
