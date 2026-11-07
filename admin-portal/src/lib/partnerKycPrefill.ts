type KycPrefillProfile = {
  businessName: string;
  businessAddress: string;
};

type VerifiedGstResult = Record<string, unknown>;

const textValue = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }

  return '';
};

const formatAddress = (value: unknown): string => {
  const directValue = textValue(value);
  if (directValue) return directValue;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return '';
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, nestedValue]) => {
      const formattedValue = formatAddress(nestedValue);
      return formattedValue ? `${key.replace(/[_-]+/g, ' ')}: ${formattedValue}` : '';
    })
    .filter(Boolean)
    .join(', ');
};

export const mergeVerifiedGstPrefill = <T extends KycPrefillProfile>(
  profile: T,
  gstResult: VerifiedGstResult | null | undefined,
  fallbackBusinessNames: string[] = [],
): T => {
  if (!gstResult) return profile;

  const currentBusinessName = profile.businessName.trim();
  const fallbackNames = new Set(fallbackBusinessNames.map((name) => name.trim().toLowerCase()).filter(Boolean));
  const gstBusinessName = textValue(gstResult.businessName) || textValue(gstResult.legalName);
  const gstAddress = formatAddress(gstResult.addressDetails) || formatAddress(gstResult.address);

  return {
    ...profile,
    businessName: gstBusinessName && (!currentBusinessName || fallbackNames.has(currentBusinessName.toLowerCase()))
      ? gstBusinessName
      : profile.businessName,
    businessAddress: gstAddress && !profile.businessAddress.trim()
      ? gstAddress
      : profile.businessAddress,
  };
};
