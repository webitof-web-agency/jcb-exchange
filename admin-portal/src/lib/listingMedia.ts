export type ListingMediaPayload = {
  id?: string;
  url?: unknown;
  fileUrl?: unknown;
  absoluteUrl?: unknown;
  driveUrl?: unknown;
  driveFileId?: unknown;
  type?: unknown;
  slot?: string | null;
  isFeatured?: boolean;
};

export type NormalizedListingMedia = ListingMediaPayload & {
  id: string;
  url: string;
  type: string;
  isFeatured: boolean;
};

export type ListingPayload = {
  media?: NormalizedListingMedia[];
  [key: string]: unknown;
};

const getMediaUrl = (media: ListingMediaPayload) => {
  const candidates = [media.url, media.fileUrl, media.absoluteUrl, media.driveUrl, media.driveFileId];
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0) || null;
};

export const normalizeListingMedia = (media: unknown): NormalizedListingMedia[] => {
  if (!Array.isArray(media)) {
    return [];
  }

  return media.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const source = item as ListingMediaPayload;
    const url = getMediaUrl(source);
    if (!url) {
      return [];
    }

    return [{
      ...source,
      id: source.id || `media-${index}`,
      url,
      type: typeof source.type === 'string' ? source.type.trim().toUpperCase() : 'IMAGE',
      isFeatured: Boolean(source.isFeatured),
    }];
  });
};

export const normalizeListingPayload = (payload: unknown): ListingPayload => {
  if (!payload || typeof payload !== 'object') {
    return { media: [] };
  }

  const response = payload as { listing?: unknown; media?: unknown };
  const listing = response.listing && typeof response.listing === 'object'
    ? response.listing as ListingPayload
    : payload as ListingPayload;
  const nestedMedia = normalizeListingMedia(listing.media);
  const responseMedia = normalizeListingMedia(response.media);

  return {
    ...listing,
    media: nestedMedia.length > 0 ? nestedMedia : responseMedia,
  };
};

export const getListingVideoMedia = (payload: unknown) => {
  const normalizedPayload = normalizeListingPayload(payload);
  return normalizedPayload.media?.find(
    (media) => String(media.type || '').toUpperCase() === 'VIDEO',
  ) || null;
};
