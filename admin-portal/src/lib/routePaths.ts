import { buildSlugSegments, buildSlugWithShortSuffix, slugify } from '@/lib/routeSlug';

type ListingRouteInput = {
  id: string;
  title?: string | null;
  manufacturingYear?: number | string | null;
  locationCity?: string | null;
};

type PartnerRouteInput = {
  id: string;
  name?: string | null;
  businessName?: string | null;
  district?: string | null;
};

type VisitorRouteInput = {
  id: string;
  fullName?: string | null;
  name?: string | null;
  city?: string | null;
};

type ContactRouteInput = {
  id: string;
  name?: string | null;
  city?: string | null;
};

type LeadRouteInput = {
  id: string;
  customerName?: string | null;
  listingTitle?: string | null;
};

type ListingPaymentRouteInput = {
  id: string;
  listingTitle?: string | null;
  method?: string | null;
};

type SoldVehicleRouteInput = {
  id: string;
  recordNumber?: string | null;
  vehicleNumber?: string | null;
  listingTitle?: string | null;
  brandName?: string | null;
  vehicleModel?: string | null;
};

type RtoRouteInput = {
  id: string;
  vehicleNumber?: string | null;
};

type RecruitmentJobRouteInput = {
  slug?: string | null;
  title?: string | null;
};

type RecruitmentApplicationRouteInput = {
  applicationRef: string;
};

const joinDetailPath = (basePath: string, slugValue: string) => `${basePath}/${slugValue}`;

const normalizeBasePath = (basePath: string) => basePath.replace(/\/$/, '');

export const getRecruitmentPortalBasePath = (pathname: string): string =>
  pathname.startsWith('/employee/') ? '/employee/recruitment' : '/admin/recruitment';

export const generateRecruitmentJobDetailPath = (
  basePath: string,
  job: RecruitmentJobRouteInput,
): string => {
  const jobSlug = slugify(job.slug || job.title || '') || 'job';
  return `${normalizeBasePath(basePath)}/jobs/${jobSlug}`;
};

export const generateRecruitmentApplicationDetailPath = (
  basePath: string,
  application: RecruitmentApplicationRouteInput,
): string => {
  const applicationRef = application.applicationRef.trim().replace(/[^A-Za-z0-9_-]+/g, '-');
  return `${normalizeBasePath(basePath)}/applications/${applicationRef || 'application'}`;
};

export const generateAdminListingDetailPath = (basePath: string, listing: ListingRouteInput): string => {
  const slug = buildSlugSegments(listing.title, listing.manufacturingYear, listing.locationCity);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'listing', listing.id));
};

export const generateAdminPartnerDetailPath = (basePath: string, partner: PartnerRouteInput): string => {
  const slug = buildSlugSegments(partner.businessName || partner.name, partner.district);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'partner', partner.id));
};

export const generateAdminPartnerEditPath = (basePath: string, partner: PartnerRouteInput): string => {
  return `${generateAdminPartnerDetailPath(basePath, partner)}/edit`;
};

export const generateAdminVisitorDetailPath = (basePath: string, visitor: VisitorRouteInput): string => {
  const slug = buildSlugSegments(visitor.fullName || visitor.name, visitor.city);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'visitor', visitor.id));
};

export const generateAdminContactDetailPath = (basePath: string, contact: ContactRouteInput): string => {
  const slug = buildSlugSegments(contact.name, contact.city);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'contact', contact.id));
};

export const generateAdminLeadDetailPath = (basePath: string, lead: LeadRouteInput): string => {
  const slug = buildSlugSegments(lead.customerName, lead.listingTitle);
  return joinDetailPath(basePath, buildSlugWithShortSuffix(slug || 'enquiry', lead.id));
};

export const generateAdminListingPaymentDetailPath = (basePath: string, payment: ListingPaymentRouteInput): string => {
  const normalizedBasePath = basePath.replace(/\/$/, '');
  const paymentBasePath = normalizedBasePath.endsWith('/payments')
    ? normalizedBasePath
    : `${normalizedBasePath}/payments`;
  const slug = buildSlugSegments(payment.listingTitle, payment.method);
  return joinDetailPath(paymentBasePath, buildSlugWithShortSuffix(slug || 'payment', payment.id));
};

export const generateAdminListingPaymentLookupPath = (basePath: string, listing: ListingRouteInput): string => {
  const slug = buildSlugSegments(listing.title, listing.manufacturingYear, listing.locationCity);
  return joinDetailPath(normalizeBasePath(basePath), buildSlugWithShortSuffix(slug || 'listing-payment', listing.id));
};

export const generateAdminSoldVehicleDetailPath = (basePath: string, record: SoldVehicleRouteInput): string => {
  const fallbackTitle = [record.brandName, record.vehicleModel].filter(Boolean).join(' ');
  const slug = buildSlugSegments(record.recordNumber, record.vehicleNumber, record.listingTitle || fallbackTitle);
  return joinDetailPath(normalizeBasePath(basePath), buildSlugWithShortSuffix(slug || 'sold-vehicle', record.id));
};

export const formatVehicleRegistrationPath = (value?: string | null): string => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '';
  const compact = normalized.replace(/[\s-]+/g, '');
  const standardMatch = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (standardMatch) return [standardMatch[1], standardMatch[2], standardMatch[3], standardMatch[4]].join('-');
  const stateAndNumberMatch = compact.match(/^([A-Z]{2})(\d{1,2})(\d{1,4})$/);
  if (stateAndNumberMatch) return [stateAndNumberMatch[1], stateAndNumberMatch[2], stateAndNumberMatch[3]].join('-');
  return normalized.replace(/[\s-]+/g, '-');
};

export const generateAdminRtoDetailPath = (basePath: string, record: RtoRouteInput): string => {
  const registration = formatVehicleRegistrationPath(record.vehicleNumber);
  return joinDetailPath(normalizeBasePath(basePath), encodeURIComponent(registration || record.id));
};

type FinanceTransactionRouteInput = {
  id: string;
  name?: string | null;
  category?: string | null;
  transactionDate?: string | null;
};

/** Expenses & income detail: "<payee>-<category>-<yyyy-mm-dd>-<first 13 characters of the id>". */
export const generateFinanceTransactionDetailPath = (basePath: string, transaction: FinanceTransactionRouteInput): string => {
  const day = transaction.transactionDate ? String(transaction.transactionDate).slice(0, 10) : null;
  const slug = buildSlugSegments(transaction.name, transaction.category, day);
  return joinDetailPath(normalizeBasePath(basePath), buildSlugWithShortSuffix(slug || 'transaction', transaction.id));
};
