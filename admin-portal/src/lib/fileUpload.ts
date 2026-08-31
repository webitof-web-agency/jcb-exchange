'use client';

import api from '@/lib/api';

export const MAX_IMAGE_INPUT_SIZE = 5 * 1024 * 1024;
export const MAX_PDF_INPUT_SIZE = 3 * 1024 * 1024;
export const MAX_LISTING_VIDEO_INPUT_SIZE = 15 * 1024 * 1024;
export const MAX_LISTING_VIDEO_DURATION_SECONDS = 60;
export const MAX_FINANCE_SUPPORT_IMAGE_INPUT_SIZE = 2 * 1024 * 1024;
export const MAX_HERO_IMAGE_INPUT_SIZE = 5 * 1024 * 1024;
export const MAX_INSPECTION_SECTION_IMAGE_INPUT_SIZE = 5 * 1024 * 1024;
export const MAX_SITE_LOGO_IMAGE_INPUT_SIZE = 2 * 1024 * 1024;
export const MAX_SITE_FAVICON_IMAGE_INPUT_SIZE = 1024 * 1024;
export const MAX_SITE_MANIFEST_ICON_IMAGE_INPUT_SIZE = 1024 * 1024;
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
const SITE_LOGO_TARGET_MIN_IMAGE_SIZE = 80 * 1024;
const SITE_LOGO_TARGET_MAX_IMAGE_SIZE = 220 * 1024;
const SITE_FAVICON_TARGET_MAX_IMAGE_SIZE = 80 * 1024;
const SITE_FAVICON_MAX_DIMENSION = 512;
const SITE_MANIFEST_ICON_TARGET_MAX_IMAGE_SIZE = 160 * 1024;
const SITE_MANIFEST_ICON_DIMENSION = 512;

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

const normalizeUploadPath = (fileUrl: string) => {
  const trimmed = fileUrl.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname.replace(/^\/api(?=\/uploads\/)/i, '');
    } catch {
      return trimmed;
    }
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalizedPath.replace(/^\/api(?=\/uploads\/)/i, '');
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
    const normalizedPath = normalizeUploadPath(fileUrl);
    if (/^https?:\/\//i.test(normalizedPath)) {
      return normalizedPath;
    }
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_API_URL is not set');
  }

  const origin = apiUrl.replace(/\/api\/?$/, '');
  const normalizedPath = normalizeUploadPath(fileUrl);
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

export const validateSiteLogoImageFile = async (file: File) => {
  const isImage = allowedImageTypes.has(file.type);

  if (!isImage) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  if (file.size > MAX_SITE_LOGO_IMAGE_INPUT_SIZE) {
    throw new Error(`Site logo image must be ${bytesToReadableLimit(MAX_SITE_LOGO_IMAGE_INPUT_SIZE)} or smaller.`);
  }
};

export const validateSiteFaviconImageFile = async (file: File) => {
  const isImage = allowedImageTypes.has(file.type);

  if (!isImage) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  if (file.size > MAX_SITE_FAVICON_IMAGE_INPUT_SIZE) {
    throw new Error(`Favicon image must be ${bytesToReadableLimit(MAX_SITE_FAVICON_IMAGE_INPUT_SIZE)} or smaller.`);
  }
};

export const validateSiteManifestIconImageFile = async (file: File) => {
  const isImage = allowedImageTypes.has(file.type);

  if (!isImage) {
    throw new Error('Only JPG, PNG, and WEBP images are allowed.');
  }

  if (file.size > MAX_SITE_MANIFEST_ICON_IMAGE_INPUT_SIZE) {
    throw new Error(`Manifest icon image must be ${bytesToReadableLimit(MAX_SITE_MANIFEST_ICON_IMAGE_INPUT_SIZE)} or smaller.`);
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

const fitImageWithinCustomBounds = (width: number, height: number, maxWidth: number, maxHeight: number) => {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
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

export const prepareSiteLogoImageForUpload = async (file: File) => {
  await validateSiteLogoImageFile(file);

  return compressImageForUpload(file, {
    targetMinBytes: SITE_LOGO_TARGET_MIN_IMAGE_SIZE,
    targetMaxBytes: SITE_LOGO_TARGET_MAX_IMAGE_SIZE,
  });
};

export const prepareSiteFaviconImageForUpload = async (file: File) => {
  await validateSiteFaviconImageFile(file);

  const image = await loadImage(file);
  const dimensions = fitImageWithinCustomBounds(
    image.width,
    image.height,
    SITE_FAVICON_MAX_DIMENSION,
    SITE_FAVICON_MAX_DIMENSION
  );
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize favicon compression.');
  }

  context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

  const toPngBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Unable to compress the selected favicon.'));
            return;
          }

          resolve(blob);
        },
        'image/png',
        0.92
      );
    });

  let blob = await toPngBlob();
  if (blob.size > SITE_FAVICON_TARGET_MAX_IMAGE_SIZE) {
    const shrinkRatio = Math.sqrt(SITE_FAVICON_TARGET_MAX_IMAGE_SIZE / blob.size);
    const nextWidth = Math.max(64, Math.round(canvas.width * shrinkRatio));
    const nextHeight = Math.max(64, Math.round(canvas.height * shrinkRatio));
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    context.drawImage(image, 0, 0, nextWidth, nextHeight);
    blob = await toPngBlob();
  }

  const outputName = file.name.replace(/\.[^.]+$/, '') || 'favicon';
  return blobToFile(blob, `${outputName}.png`);
};

export const prepareSiteManifestIconImageForUpload = async (file: File) => {
  await validateSiteManifestIconImageFile(file);

  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = SITE_MANIFEST_ICON_DIMENSION;
  canvas.height = SITE_MANIFEST_ICON_DIMENSION;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to initialize manifest icon compression.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);

  const dimensions = fitImageWithinCustomBounds(
    image.width,
    image.height,
    SITE_MANIFEST_ICON_DIMENSION,
    SITE_MANIFEST_ICON_DIMENSION
  );
  const offsetX = Math.round((SITE_MANIFEST_ICON_DIMENSION - dimensions.width) / 2);
  const offsetY = Math.round((SITE_MANIFEST_ICON_DIMENSION - dimensions.height) / 2);

  context.drawImage(image, offsetX, offsetY, dimensions.width, dimensions.height);

  const toPngBlob = () =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Unable to compress the selected manifest icon.'));
            return;
          }

          resolve(blob);
        },
        'image/png',
        0.92
      );
    });

  let blob = await toPngBlob();
  if (blob.size > SITE_MANIFEST_ICON_TARGET_MAX_IMAGE_SIZE) {
    const shrinkDimension = 384;
    canvas.width = shrinkDimension;
    canvas.height = shrinkDimension;
    context.clearRect(0, 0, shrinkDimension, shrinkDimension);
    const nextDimensions = fitImageWithinCustomBounds(
      image.width,
      image.height,
      shrinkDimension,
      shrinkDimension
    );
    const nextOffsetX = Math.round((shrinkDimension - nextDimensions.width) / 2);
    const nextOffsetY = Math.round((shrinkDimension - nextDimensions.height) / 2);
    context.drawImage(image, nextOffsetX, nextOffsetY, nextDimensions.width, nextDimensions.height);
    blob = await toPngBlob();
  }

  const outputName = file.name.replace(/\.[^.]+$/, '') || 'manifest-icon';
  return blobToFile(blob, `${outputName}.png`);
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

export const uploadSiteLogoImageToServer = async (file: File) => {
  const preparedFile = await prepareSiteLogoImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/site-logo',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};

export const uploadSiteFaviconImageToServer = async (file: File) => {
  const preparedFile = await prepareSiteFaviconImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/site-favicon',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};

export const uploadSiteManifestIconImageToServer = async (file: File) => {
  const preparedFile = await prepareSiteManifestIconImageForUpload(file);
  const formData = new FormData();
  formData.append('file', preparedFile);

  const response = await api.post<{ file: UploadedFileResult }>(
    '/documents/upload/public/site-manifest-icon',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );

  return response.data.file;
};
