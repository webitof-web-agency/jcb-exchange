export type ListingCompletionUploadState = Partial<Record<string, boolean>>;

export const setListingCompletionSlotUploading = (
  state: ListingCompletionUploadState,
  slot: string,
  uploading: boolean,
): ListingCompletionUploadState => {
  const next = { ...state };
  if (uploading) next[slot] = true;
  else delete next[slot];
  return next;
};

export const isListingCompletionSlotUploading = (
  state: ListingCompletionUploadState,
  slot: string,
) => state[slot] === true;
