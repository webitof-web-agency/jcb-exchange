type ListingCompletionMediaRequirements = {
  imageCount: number;
  hasFrontPhoto: boolean;
  hasVideo: boolean;
};

export const getListingCompletionMediaError = ({
  imageCount,
  hasFrontPhoto,
  hasVideo,
}: ListingCompletionMediaRequirements) => {
  if (imageCount < 1) return 'At least one vehicle photo is required.';
  if (!hasFrontPhoto) return 'A front vehicle photo is required.';
  if (!hasVideo) return 'A walkaround video is required.';
  return null;
};
