export type LoaderLogoSources = {
  initialLogoUrl?: string | null;
  darkLogoUrl: string | null;
  logoUrl: string | null;
};

const withoutQuery = (url: string) => url.split('?')[0];

export const getLoaderLogoUrl = (sources: LoaderLogoSources): string | null =>
  sources.initialLogoUrl || sources.darkLogoUrl || sources.logoUrl || null;

export const getLogoLoadErrorFallback = (
  failedUrl: string,
  sources: LoaderLogoSources,
): string | null => {
  if (sources.darkLogoUrl && withoutQuery(failedUrl) === withoutQuery(sources.darkLogoUrl)) {
    return null;
  }

  return sources.logoUrl && withoutQuery(failedUrl) !== withoutQuery(sources.logoUrl)
    ? sources.logoUrl
    : null;
};
