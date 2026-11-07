import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { buildSlugWithShortSuffix, slugify } from '@/lib/routeSlug';

export interface VerificationItem {
  id: string;
  name: string;
  email: string | null;
  mobile?: string | null;
  ownerName?: string | null;
  city?: string | null;
  state?: string | null;
  partnerType: string;
  appliedOn: string;
  status: string;
}

export interface VerificationTemplateSummary {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  createdAt: string;
}

export interface VerificationDocument {
  id: string;
  documentType: string;
  fileUrl: string | null;
  fileName: string | null;
  documentNumber: string | null;
  nameOnDocument: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  submittedNote: string | null;
  status: string;
  reviewComment: string | null;
  verificationStatus: string | null;
  verificationRecordId: string | null;
  verificationCacheHit: boolean;
  verificationMessage: string | null;
  verificationRequestedAt: string | null;
  verificationCompletedAt: string | null;
  verificationTemplate: VerificationTemplateSummary | null;
}

export interface VerificationDetail {
  id: string;
  partnerCode: string | null;
  ownerName: string | null;
  email: string | null;
  mobile: string | null;
  whatsappNumber: string | null;
  city: string | null;
  state: string | null;
  profile: {
    partnerCode: string | null;
    ownerName: string | null;
    businessName: string | null;
    partnerType: string | null;
    businessAddress: string | null;
    district: string | null;
    pinCode: string | null;
    businessExperience: string | null;
    expectedMonthlyListings: number | null;
    businessDescription: string | null;
    serviceAreas: string | null;
    workingHours: string | null;
    gstNumber: string | null;
    businessRegistrationNumber: string | null;
    websiteUrl: string | null;
    socialLinks: string | null;
    yearsInBusiness: number | null;
    teamSize: number | null;
    contactPreference: string | null;
    googleMapsLocation: string | null;
    onboardingStatus: string;
    kycStatus: string;
    accountStatus: string;
    approvedAt: string | null;
  };
  documents: VerificationDocument[];
  agreements: Array<{
    agreementType: string;
    version: string;
    acceptedAt: string;
  }>;
  reviewHistory: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
  }>;
}

export type VerificationDecisionStatus = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

// Documents whose government verification produces a saved template PDF instead of an uploaded file.
export const TEMPLATE_DOCUMENT_TYPES = ['PAN_CARD', 'GST_CERTIFICATE', 'AADHAAR_CARD'] as const;
export type TemplateDocumentType = (typeof TEMPLATE_DOCUMENT_TYPES)[number];

export const isTemplateDocumentType = (documentType: string): documentType is TemplateDocumentType =>
  (TEMPLATE_DOCUMENT_TYPES as readonly string[]).includes(documentType);

export const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatStatus = (value?: string | null) => (value ? value.replaceAll('_', ' ') : '-');

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) return '';
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export const getReviewActionLabel = (action: string, partnerType?: string | null, partnerName?: string | null) => {
  const resolvedPartnerType = formatPartnerTypeLabel(partnerType);
  const resolvedPartnerName = partnerName?.trim() || 'Unknown';
  const labels: Record<string, string> = {
    PARTNER_SAVED_ONBOARDING_DRAFT: `${resolvedPartnerType} ${resolvedPartnerName} saved onboarding draft`,
    PARTNER_SUBMITTED_FULL_ONBOARDING: `${resolvedPartnerType} ${resolvedPartnerName} submitted full onboarding`,
    SUPER_ADMIN_APPROVED: `SuperAdmin approved KYC & activated partner`,
    SUPER_ADMIN_CHANGES_REQUESTED: `SuperAdmin requested updates/changes`,
    SUPER_ADMIN_REJECTED: `SuperAdmin rejected application`,
  };

  return labels[action] || formatStatus(action);
};

export const statusLabel: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  CHANGES_REQUESTED: 'Changes Requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
};

export const verificationStatusLabel: Record<string, string> = {
  VERIFIED: 'Verified',
  FAILED: 'Verification failed',
  VERIFYING: 'Verifying',
  MANUAL_REVIEW: 'Manual review',
  NOT_STARTED: 'Not verified',
};

export const documentDisplayTitles: Record<string, string> = {
  PAN_CARD: 'Company PAN / PAN Card',
  GST_CERTIFICATE: 'GST Certificate',
  AADHAAR_CARD: 'Aadhaar / Accepted ID',
  PASSPORT_PHOTO: 'Passport-size Photo',
  CANCELLED_CHEQUE: 'Cancelled Cheque',
  AUTHORIZED_PERSON_ID: 'Authorized Place ID',
};

export const verificationsBasePath = (pathname: string) =>
  pathname.startsWith('/employee') ? '/employee/verifications' : '/admin/verifications';

export const partnerEditBasePathFor = (pathname: string) =>
  pathname.startsWith('/employee') ? '/employee/partners' : '/admin/partners';

// Readable review URL: "<business name>-<first 13 characters of the id>". Built from the name only, so
// the list and the review page (which redirects to this) always agree.
export const verificationReviewPath = (pathname: string, partner: { id: string; name?: string | null }) =>
  `${verificationsBasePath(pathname)}/${buildSlugWithShortSuffix(slugify(partner.name || '') || 'partner', partner.id)}`;

// The admin template endpoint is `${base}/${recordId}/template`; template previews append that suffix themselves.
export const partnerTemplateEndpointBase = (partnerId: string, documentType: string) =>
  `/superadmin/verifications/${partnerId}/${documentType}`;
