import { extractDriveFileIdFromSecureUrl } from './secureDocumentUrl';

export const getDriveFileIdsToDelete = (
  existingUrls: readonly (string | null | undefined)[],
  nextUrls: readonly (string | null | undefined)[],
) => {
  const retainedDriveIds = new Set(
    nextUrls
      .map((url) => extractDriveFileIdFromSecureUrl(url))
      .filter((fileId): fileId is string => Boolean(fileId)),
  );

  const removedDriveIds = new Set<string>();
  for (const url of existingUrls) {
    const fileId = extractDriveFileIdFromSecureUrl(url);
    if (fileId && !retainedDriveIds.has(fileId)) {
      removedDriveIds.add(fileId);
    }
  }

  return [...removedDriveIds];
};
