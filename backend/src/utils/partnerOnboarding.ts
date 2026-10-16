export type PartnerProfileCompletionInput = {
  ownerName?: string | null | undefined;
  businessName?: string | null | undefined;
  partnerType?: string | null | undefined;
  primaryContact?: string | null | undefined;
  whatsappNumber?: string | null | undefined;
  state?: string | null | undefined;
  city?: string | null | undefined;
  pinCode?: string | null | undefined;
  businessAddress?: string | null | undefined;
  businessExperience?: string | null | undefined;
  expectedMonthlyListings?: number | string | null | undefined;
  contactPreference?: string | null | undefined;
};

export type PartnerDocumentDraftInput = {
  fileUrl?: string | null;
  fileName?: string | null;
  documentNumber?: string | null;
  nameOnDocument?: string | null;
  issueDate?: Date | string | null;
  expiryDate?: Date | string | null;
  submittedNote?: string | null;
};

const normalizeText = (value?: string | null) => value?.trim() || null;

const parseOptionalInt = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};

export const hasPartnerDocumentDraftData = (document: PartnerDocumentDraftInput) =>
  [
    document.fileUrl,
    document.fileName,
    document.documentNumber,
    document.nameOnDocument,
    document.issueDate,
    document.expiryDate,
    document.submittedNote,
  ].some((value) =>
    value instanceof Date || (typeof value === 'string' && value.trim().length > 0)
  );

export const isPartnerProfileComplete = (profile: PartnerProfileCompletionInput) =>
  !!(
    normalizeText(profile.ownerName) &&
    normalizeText(profile.businessName) &&
    !!profile.partnerType &&
    ['SHOWROOM', 'BROKER'].includes(profile.partnerType) &&
    normalizeText(profile.primaryContact) &&
    normalizeText(profile.whatsappNumber) &&
    normalizeText(profile.state) &&
    normalizeText(profile.city) &&
    normalizeText(profile.pinCode) &&
    normalizeText(profile.businessAddress) &&
    normalizeText(profile.businessExperience) &&
    (profile.partnerType === 'SHOWROOM' || parseOptionalInt(profile.expectedMonthlyListings) !== null) &&
    (profile.partnerType === 'SHOWROOM' || normalizeText(profile.contactPreference) !== null)
  );
