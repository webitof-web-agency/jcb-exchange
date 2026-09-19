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
  pathname.startsWith('/employee/') ? '/employee/recruitment' : '/superadmin/recruitment';

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
