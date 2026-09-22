import { normalizeRemoteMediaUrl } from './mediaUrl';

export type SiteBrandingMedia = {
  imageUrl: string | null;
  darkLogoUrl: string | null;
  faviconUrl: string | null;
  manifestIconUrl: string | null;
};

type SiteBrandingMediaPatch = {
  [Key in keyof SiteBrandingMedia]?: SiteBrandingMedia[Key] | undefined;
};

/**
 * Branding updates may change just one asset at a time. Omitted fields must
 * remain untouched, while an explicit null clears the corresponding asset.
 * All non-empty values are restricted to portable remote media URLs.
 */
export const mergeSiteBrandingMedia = (
  current: SiteBrandingMedia,
  patch: SiteBrandingMediaPatch,
): SiteBrandingMedia => {
  const resolve = (key: keyof SiteBrandingMedia) =>
    patch[key] === undefined ? current[key] : normalizeRemoteMediaUrl(patch[key]);

  return {
    imageUrl: resolve('imageUrl'),
    darkLogoUrl: resolve('darkLogoUrl'),
    faviconUrl: resolve('faviconUrl'),
    manifestIconUrl: resolve('manifestIconUrl'),
  };
};
