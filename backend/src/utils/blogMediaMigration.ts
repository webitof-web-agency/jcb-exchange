export type BlogImageSourceMigrator = (source: string) => Promise<string>;

const BLOG_IMAGE_SOURCE_PATTERN = /(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi;

/**
 * Rewrites image URLs inside stored blog HTML without touching any other markup.
 * The callback is deliberately injected so the migration can be tested without
 * connecting to Google Drive.
 */
export const replaceBlogImageSources = async (
  html: string,
  migrateSource: BlogImageSourceMigrator,
) => {
  const matches = Array.from(html.matchAll(BLOG_IMAGE_SOURCE_PATTERN));
  const migratedSources = await Promise.all(
    matches.map((match) => migrateSource(match[3] || '')),
  );
  let migratedHtml = html;

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const source = match?.[3];
    const matchStart = match?.index;
    if (!source || matchStart === undefined) continue;

    const migratedSource = migratedSources[index];
    if (!migratedSource || migratedSource === source) continue;

    const sourceStart = matchStart + (match[1] || '').length + 1;
    const sourceEnd = sourceStart + source.length;
    migratedHtml = `${migratedHtml.slice(0, sourceStart)}${migratedSource}${migratedHtml.slice(sourceEnd)}`;
  }

  return migratedHtml;
};
