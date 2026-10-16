export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const getAvatarInputValidationError = (file: File) => {
  if (!AVATAR_TYPES.has(file.type)) {
    return 'Only JPG, PNG, and WEBP images are allowed.';
  }

  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    return 'Image must be 15 MB or smaller before compression.';
  }

  return null;
};

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read the selected image.'));
    };
    image.src = objectUrl;
  });

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to compress the selected image.'));
        return;
      }
      resolve(blob);
    }, 'image/webp', quality);
  });

export const compressAvatarImage = async (file: File) => {
  const validationError = getAvatarInputValidationError(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const image = await loadImage(file);
  const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const initialDimension = Math.min(512, Math.max(192, longestSide || 512));
  const dimensions = [initialDimension, 448, 384, 320, 256];
  const qualities = [0.86, 0.74, 0.62, 0.5];

  for (const dimension of dimensions) {
    const scale = Math.min(1, dimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to prepare the selected image.');
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= AVATAR_MAX_BYTES) {
        return new File([blob], 'avatar.webp', {
          type: blob.type || 'image/webp',
          lastModified: Date.now(),
        });
      }
    }
  }

  throw new Error('This image could not be compressed below 2 MB. Please choose a smaller image.');
};
