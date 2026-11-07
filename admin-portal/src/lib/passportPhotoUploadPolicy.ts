export const MAX_PASSPORT_PHOTO_INPUT_SIZE = 3 * 1024 * 1024;
export const TARGET_MAX_PASSPORT_PHOTO_SIZE = 1.5 * 1024 * 1024;

const allowedPassportPhotoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const getPassportPhotoUploadValidationError = (file: Pick<File, 'type' | 'size'>) => {
  if (!allowedPassportPhotoTypes.has(file.type)) {
    return 'Only JPG, PNG, and WEBP passport photos are allowed.';
  }

  if (file.size > MAX_PASSPORT_PHOTO_INPUT_SIZE) {
    return `Passport photo size must be ${Math.round(MAX_PASSPORT_PHOTO_INPUT_SIZE / (1024 * 1024))}MB or smaller.`;
  }

  return null;
};

export const isCanonicalPassportPhoto = (file: Pick<File, 'type' | 'name' | 'size'>) =>
  file.type === 'image/webp' && file.name.toLowerCase().endsWith('.webp') && file.size <= TARGET_MAX_PASSPORT_PHOTO_SIZE;
