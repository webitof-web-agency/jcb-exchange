export type MediaSlotPresentationKind = 'image' | 'video';

type MediaAssetNameInput = {
  kind: MediaSlotPresentationKind;
  originalName?: string | null;
  fileUrl?: string | null;
};

type MediaPreviewSourceInput = {
  kind: MediaSlotPresentationKind;
  previewUrl?: string | null;
  absoluteUrl?: string | null;
  fileUrl?: string | null;
};

const FALLBACK_NAMES: Record<MediaSlotPresentationKind, string> = {
  image: 'Vehicle photo',
  video: 'Vehicle video',
};

const decodeSafely = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getSafeFileName = (value?: string | null) => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate) return '';

  const withoutQuery = candidate.split(/[?#]/, 1)[0] || '';
  const segment = decodeSafely(withoutQuery.split('/').pop() || '').trim();
  if (!segment || /^(?:uc|view|preview)$/i.test(segment)) return '';
  if (/^(?:https?:|drive\.google|id=|file)$/i.test(segment)) return '';

  const sanitized = segment.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return sanitized.length <= 120 ? sanitized : sanitized.slice(0, 117).trimEnd() + '...';
};

export const getMediaAssetDisplayName = ({ kind, originalName, fileUrl }: MediaAssetNameInput) => {
  const original = getSafeFileName(originalName);
  if (original) return original;

  const fromUrl = getSafeFileName(fileUrl);
  return fromUrl || FALLBACK_NAMES[kind];
};

export const getMediaPreviewSource = ({ kind, previewUrl, absoluteUrl, fileUrl }: MediaPreviewSourceInput) => {
  const candidates = kind === 'video'
    ? [absoluteUrl, fileUrl, previewUrl]
    : [previewUrl, absoluteUrl, fileUrl];

  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0) || '';
};
