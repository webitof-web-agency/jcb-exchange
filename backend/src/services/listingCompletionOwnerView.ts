type OwnerViewRelation = { id: string; name: string } | null;
type OwnerViewMedia = { id: string; url: string; type: string; slot: string | null; isFeatured: boolean };

type ListingCompletionOwnerViewInput = {
  [key: string]: unknown;
  id: string;
  title: string;
  ownerName?: string | null;
  price?: unknown;
  isNegotiable?: boolean;
  manufacturingYear?: number;
  operatingHours?: number | null;
  locationState?: string;
  locationCity?: string;
  address?: string | null;
  condition?: string | null;
  description?: string | null;
  additionalDescription?: string | null;
  grossPower?: string | null;
  engineNumber?: string | null;
  category: OwnerViewRelation;
  brand: OwnerViewRelation;
  model: OwnerViewRelation;
  rtoRecords?: unknown[];
  media: OwnerViewMedia[];
};

export const toListingCompletionOwnerView = ({
  id,
  title,
  ownerName,
  price,
  isNegotiable,
  manufacturingYear,
  operatingHours,
  locationState,
  locationCity,
  address,
  condition,
  description,
  additionalDescription,
  grossPower,
  engineNumber,
  category,
  brand,
  model,
  rtoRecords,
  media,
}: ListingCompletionOwnerViewInput) => ({
  id,
  title,
  ownerName,
  price,
  isNegotiable,
  manufacturingYear,
  operatingHours,
  locationState,
  locationCity,
  address,
  condition,
  description,
  additionalDescription,
  grossPower,
  engineNumber,
  category,
  brand,
  model,
  rtoRecords,
  media,
});
