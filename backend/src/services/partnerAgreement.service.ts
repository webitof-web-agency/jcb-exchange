import { createHash } from 'crypto';

export const PARTNER_AGREEMENT_TYPES = new Set([
  'MARKETPLACE_TERMS',
  'PARTNER_TERMS',
  'LISTING_AUTHENTICITY',
  'MEDIA_OWNERSHIP',
  'SECURITY_DEPOSIT_POLICY',
  'REFUND_POLICY',
  'CUSTOMER_DATA_USAGE',
  'CONTACT_VISIBILITY_POLICY',
  'FRAUD_POLICY',
  'LISTING_SUSPENSION_POLICY',
  'SOLD_MEDIA_DELETION_POLICY',
  'FEATURED_IMAGE_RETENTION_CONSENT',
  'COMMISSION_POLICY',
  'LEAD_OWNERSHIP_POLICY',
]);

export type PartnerAgreementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type NormalizedPartnerAgreementInput = {
  agreementType: string;
  title: string;
  summary: string;
  content: string;
  version: string;
  applicablePartnerTypes: string[];
  isRequired: boolean;
  displayOrder: number;
  status: PartnerAgreementStatus;
};

export type PartnerAgreementDefinitionForCompletion = {
  agreementType: string;
  version: string;
  isRequired: boolean;
};

export type PartnerAgreementAcceptanceForCompletion = {
  agreementType: string;
  version: string;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const normalizePartnerAgreementInput = (input: Record<string, unknown>): NormalizedPartnerAgreementInput => {
  const agreementType = normalizeText(input.agreementType).toUpperCase();
  const title = normalizeText(input.title);
  const summary = normalizeText(input.summary);
  const content = normalizeText(input.content);
  const version = normalizeText(input.version) || 'v1.0';
  const status = (normalizeText(input.status).toUpperCase() || 'PUBLISHED') as PartnerAgreementStatus;
  const applicablePartnerTypes = Array.from(
    new Set(
      (Array.isArray(input.applicablePartnerTypes) ? input.applicablePartnerTypes : [])
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
  const rawDisplayOrder = typeof input.displayOrder === 'number' || typeof input.displayOrder === 'string'
    ? Number(input.displayOrder)
    : 0;

  if (!PARTNER_AGREEMENT_TYPES.has(agreementType)) {
    throw new Error('Unsupported agreement type.');
  }

  if (!title || !content) {
    throw new Error('Agreement title and content are required.');
  }

  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error('Agreement version must use the format v1.0.');
  }

  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
    throw new Error('Invalid agreement status.');
  }

  if (!Number.isInteger(rawDisplayOrder) || rawDisplayOrder < 0) {
    throw new Error('Agreement display order must be a non-negative integer.');
  }

  return {
    agreementType,
    title,
    summary,
    content,
    version,
    applicablePartnerTypes,
    isRequired: input.isRequired === true,
    displayOrder: rawDisplayOrder,
    status,
  };
};

export const areRequiredPartnerAgreementsAccepted = (
  definitions: PartnerAgreementDefinitionForCompletion[],
  acceptances: PartnerAgreementAcceptanceForCompletion[],
) => {
  const accepted = new Set(acceptances.map((item) => `${item.agreementType}:${item.version}`));
  return definitions
    .filter((definition) => definition.isRequired)
    .every((definition) => accepted.has(`${definition.agreementType}:${definition.version}`));
};

export const buildPartnerAgreementContentHash = (content: string) =>
  createHash('sha256').update(content, 'utf8').digest('hex');

export const bumpPartnerAgreementVersion = (version: string) => {
  const match = /^v(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    return 'v1.1';
  }

  return `v${match[1]}.${Number(match[2]) + 1}`;
};
