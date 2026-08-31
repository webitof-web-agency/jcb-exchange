'use client';

import api from '@/lib/api';

export const MAX_IMAGE_INPUT_SIZE = 5 * 1024 * 1024;
export const MAX_PDF_INPUT_SIZE = 3 * 1024 * 1024;
export const MAX_LISTING_VIDEO_INPUT_SIZE = 15 * 1024 * 1024;
export const MAX_LISTING_VIDEO_DURATION_SECONDS = 60;
export const MAX_FINANCE_SUPPORT_IMAGE_INPUT_SIZE = 2 * 1024 * 1024;
export const MAX_HERO_IMAGE_INPUT_SIZE = 5 * 1024 * 1024;
export const MAX_INSPECTION_SECTION_IMAGE_INPUT_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1920;
const MAX_IMAGE_HEIGHT = 1080;
const TARGET_MIN_IMAGE_SIZE = 200 * 1024;
const TARGET_MAX_IMAGE_SIZE = 500 * 1024;
const LISTING_TARGET_MIN_IMAGE_SIZE = 250 * 1024;
const LISTING_TARGET_MAX_IMAGE_SIZE = 900 * 1024;
const FINANCE_SUPPORT_TARGET_MIN_IMAGE_SIZE = 180 * 1024;
const FINANCE_SUPPORT_TARGET_MAX_IMAGE_SIZE = 450 * 1024;
const HERO_IMAGE_TARGET_MIN_IMAGE_SIZE = 500 * 1024;
const HERO_IMAGE_TARGET_MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const INSPECTION_SECTION_TARGET_MIN_IMAGE_SIZE = 450 * 1024;
const INSPECTION_SECTION_TARGET_MAX_IMAGE_SIZE = 1800 * 1024;

const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const allowedPdfTypes = new Set(['application/pdf']);
const allowedListingVideoTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const allowedFileTypesLabel = 'JPG, PNG, WEBP, and PDF';
const allowedListingMediaLabel = 'JPG, PNG, WEBP, MP4, WEBM, and MOV';

export type UploadVisibility = 'public' | 'secure';
export type ListingMediaKind = 'image' | 'video';

export type UploadedFileResult = {
  access: UploadVisibility;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileUrl: string;
  absoluteUrl: string;
};

const bytesToReadableLimit = (bytes: number) => `${Math.round(bytes / (1024 * 1024))}MB`;

export const getUploadValidationError = (file: File) => {
  const isImage = allowedImageTypes.has(file.type);
  const isPdf = allowedPdfTypes.has(file.type);

  if (!isImage && !isPdf) {
    return `Only ${allowedFileTypesLabel} files are allowed.`;
  }

  if (isImage && file.size > MAX_IMAGE_INPUT_SIZE) {
    return `Image size must be ${bytesToReadableLimit(MAX_IMAGE_INPUT_SIZE)} or smaller.`;
  }

  if (isPdf && file.size > MAX_PDF_INPUT_SIZE) {
    return `PDF size must be ${bytesToReadableLimit(MAX_PDF_INPUT_SIZE)} or smaller.`;
  }

  return null;
};

export const getAbsoluteFileUrl = (fileUrl?: string | null) => {
  if (!fileUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return fileUrl;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not set');
  }

  const origin = apiUrl.replace(/\/api\/?$/, '');
  const normalizedPath = fileUrl.startsWith('/') ? fileUrl : `/${fileUrl}`;
  return `${origin}${normalizedPath}`;
};

const blobToFile = (blob: Blob, fileName: string) =>
  new File([blob], fileName, {
    type: blob.type,
    lastModified: Date.now(),
  });

const loadVideoMetadata = (file: File) =>
  new Promise<HTMLVideoElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to read the selected video.'));
    };
    video.src = objectUrl;
  });

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

export const validateHeroImageFile = async (file: File) => {
  const isImage = allowedImageTypes.has(file.type);

  if (!isImage) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  if (file.size > MAX_HERO_IMAGE_INPUT_SIZE) {
    throw new Error(`Hero image must be ${bytesToReadableLimit(MAX_HERO_IMAGE_INPUT_SIZE)} or smaller.`);
  }
};

export const validateInspectionSectionImageFile = async (file: File) => {
  const isImage = allowedImageTypes.has(file.type);

  if (!isImage) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  if (file.size > MAX_INSPECTION_SECTION_IMAGE_INPUT_SIZE) {
    throw new Error(`Inspection section image must be ${bytesToReadableLimit(MAX_INSPECTION_SECTION_IMAGE_INPUT_SIZE)} or smaller.`);
  }
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to compress the selected image.'));
          return;
        }

        resolve(blob);
      },
      'image/webp',
      quality
    );
  });

const fitImageWithinBounds = (width: number, height: number) => {
  const ratio = Math.min(MAX_IMAGE_WIDTH / width, MAX_IMAGE_HEIGHT / height, 1);
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
};

export const validateSelectedFile = (file: File) => {
  const validationError = getUploadValidationError(file);
  if (validationError) {
    throw new Error(validationError);
  }

  return {
    isImage: allowedImageTypes.has(file.type),
    isPdf: allowedPdfTypes.has(file.type),
  };
};

export const getListingMediaValidationError = (file: File, kind: ListingMediaKind) => {
  if (kind === 'image') {
    if (!allowedImageTypes.has(file.type)) {
      return `Only ${allowedListingMediaLabel} files are allowed.`;
    }

    if (file.size > MAX_IMAGE_INPUT_SIZE) {
      return `Image size must be ${bytesToReadableLimit(MAX_IMAGE_INPUT_SIZE)} or smaller.`;
    }

    return null;
  }

  if (!allowedListingVideoTypes.has(file.type)) {
    return `Only ${allowedListingMediaLabel} files are allowed.`;
  }

  if (file.size > MAX_LISTING_VIDEO_INPUT_SIZE) {
    return `Video size must be ${bytesToReadableLimit(MAX_LISTING_VIDEO_INPUT_SIZE)} or smaller.`;
  }

  return null;
};

export const getFinanceSupportImageValidationError = (file: File) => {
  if (!allowedImageTypes.has(file.type)) {
    return 'Only JPG, PNG, and WEBP logo images are allowed.';
  }

  if (file.size > MAX_FINANCE_SUPPORT_IMAGE_INPUT_SIZE) {
    return `Logo image size must be ${bytesToReadableLimit(MAX_FINANCE_SUPPORT_IMAGE_INPUT_SIZE)} or smaller.`;
  }

  return null;
};

export const validateListingMediaFile = async (file: File, kind: ListingMediaKind) => {
  const validationError = getListingMediaValidationError(file, kind);
  if (validationError) {
    throw new Error(validationError);
  }

  if (kind === 'video') {
    const video = await loadVideoMetadata(file);
    if (video.duration > MAX_LISTING_VIDEO_DURATION_SECONDS) {
      throw new Error(`Video duration must be ${MAX_LISTING_VIDEO_DURATION_SECONDS} seconds or shorter.`);
    }
  }
};

export const validateFinanceSupportImageFile = async (file: File) => {
  const validationError = getFinanceSupportImageValidationError(file);
  if (validationError) {
    throw new Error(validationError);
  }
};

export const compressImageForUpload = async (
  file: File,
  options?: {
    targetMinBytes?: number;
    targetMaxBytes?: number;
  }
) => {
  validateSelectedFile(file);

  if (!allowedImageTypes.has(file.type)) {
    return file;
  }

  const image = await loadImage(file);
  const dimensions = fitImageWithinBounds(image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize image compression.');
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  let quality = 0.86;
  let blob = await canvasToBlob(canvas, quality);

  const targetMinBytes = options?.targetMinBytes ?? TARGET_MIN_IMAGE_SIZE;
  const targetMaxBytes = options?.targetMaxBytes ?? TARGET_MAX_IMAGE_SIZE;

  while (blob.size > targetMaxBytes && quality > 0.5) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  while (blob.size < targetMinBytes && quality < 0.96) {
    quality += 0.03;
    blob = await canvasToBlob(canvas, quality);

    if (blob.size > targetMaxBytes) {
      quality -= 0.03;
      blob = await canvasToBlob(canvas, quality);
      break;
    }
  }

  const outputName = file.name.replace(/\.[^.]+$/, '') || 'upload';
  return blobToFile(blob, `${outputName}.webp`);
};

export const prepareFileForUpload = async (file: File) => {
  const validation = validateSelectedFile(file);
  if (validation.isImage) {
    return compressImageForUpload(file);
  }

  return file;
};

export const prepareListingMediaForUpload = async (file: File, kind: ListingMediaKind) => {
  await validateListingMediaFile(file, kind);

  if (kind === 'image') {
    return compressImageForUpload(file, {
      targetMinBytes: LISTING_TARGET_MIN_IMAGE_SIZE,
      targetMaxBytes: LISTING_TARGET_MAX_IMAGE_SIZE,
    });
  }

  return file;
};

export const prepareFinanceSupportImageForUpload = async (file: File) => {
  await validateFinanceSupportImageFile(file);

  return compressImageForUpload(file, {
    targetMinBytes: FINANCE_SUPPORT_TARGET_MIN_IMAGE_SIZE,
    targetMaxBytes: FINANCE_SUPPORT_TARGET_MAX_IMAGE_SIZE,
  });
};

export const prepareHeroImageForUpload = async (file: File) => {
  await validateHeroImageFile(file);

  return compressImageForUpload(file, {
    targetMinBytes: HERO_IMAGE_TARGET_MIN_IMAGE_SIZE,
    targetMaxBytes: HERO_IMAGE_TARGET_MAX_IMAGE_SIZE,
  });
};

export const prepareInspectionSectionImageForUpload = async (file: File) => {
  await validateInspectionSectionImageFile(file);

  return compressImageForUpload(file, {
    targetMinBytes: INSPECTION_SECTION_TARGET_MIN_IMAGE_SIZE,
    targetMaxBytes: INSPECTION_SECTION_TARGET_MAX_IMAGE_SIZE,
  });
};

export const uploadFileToServer = async ({
  file,
  visibility,
}: {
  file: File;
  visibility: UploadVisibility;
}) => {
  const preparedFile = await prepareFileForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(`/documents/upload/${visibility}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data.file;
};

export const uploadListingMediaToServer = async ({
  file,
  kind,
}: {
  file: File;
  kind: ListingMediaKind;
}) => {
  const preparedFile = await prepareListingMediaForUpload(file, kind);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/listing-media',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};

export const uploadFinanceSupportImageToServer = async (file: File) => {
  const preparedFile = await prepareFinanceSupportImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/finance-support',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};

export const uploadHeroImageToServer = async (file: File) => {
  const preparedFile = await prepareHeroImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/hero-image',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};

export const uploadInspectionSectionImageToServer = async (file: File) => {
  const preparedFile = await prepareInspectionSectionImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/inspection-section',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};

export const uploadCustomerPrimeReceiptToServer = async (file: File) => {
  const preparedFile = await prepareFileForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/customer-prime-receipt',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};
