import type { HrmDocument, HrmDocumentCategory } from './hrmApi';
import { DOCUMENT_CATEGORY_LABELS } from './hrmProfile';

/** The Documents tab: files grouped by what they prove, and where each file came from. */

export type DocumentGroupId = 'OFFER' | 'PHOTO' | 'ADDRESS' | 'EDUCATION' | 'IDENTITY' | 'EXPERIENCE' | 'BANK' | 'TAX' | 'EMPLOYMENT' | 'OTHER';

export type DocumentGroup = {
  id: DocumentGroupId;
  title: string;
  categories: HrmDocumentCategory[];
  /** The upload buttons of the group: each opens the upload with that document type fixed. */
  uploads: Array<{ category: HrmDocumentCategory; label: string }>;
  /** Shown even when empty (the joining checklist asks for these). */
  always: boolean;
  help?: string;
};

const group = (id: DocumentGroupId, title: string, category: HrmDocumentCategory, always = false): DocumentGroup => ({
  id, title, categories: [category], uploads: [{ category, label: 'Upload' }], always,
});

export const DOCUMENT_GROUPS: readonly DocumentGroup[] = [
  {
    id: 'OFFER',
    title: 'Offer letter & signed copy',
    categories: ['OFFER', 'ACCEPTANCE'],
    uploads: [{ category: 'OFFER', label: 'Upload offer letter' }, { category: 'ACCEPTANCE', label: 'Upload signed copy' }],
    always: true,
    help: 'When the candidate signs on the offer link, the letter, the signed letter and the acceptance certificate appear here on their own. A paper copy can also be uploaded.',
  },
  group('PHOTO', 'Passport photo', 'PHOTO', true),
  group('ADDRESS', 'Address proof', 'ADDRESS', true),
  group('EDUCATION', 'Education certificates', 'EDUCATION', true),
  group('IDENTITY', 'Identity proof', 'IDENTITY'),
  group('EXPERIENCE', 'Experience / relieving letter', 'EXPERIENCE'),
  group('BANK', 'Bank proof', 'BANK'),
  group('TAX', 'Tax documents', 'TAX'),
  group('EMPLOYMENT', 'Employment documents', 'EMPLOYMENT'),
  group('OTHER', 'Other documents', 'OTHER'),
];

const CHECKLIST_GROUPS: Record<string, DocumentGroupId> = {
  OFFER_LETTER: 'OFFER', ACCEPTANCE: 'OFFER', PHOTO: 'PHOTO', ADDRESS_PROOF: 'ADDRESS', EDUCATION: 'EDUCATION',
};
/** The group a joining checklist item belongs to; null for items that are not documents. */
export const documentGroupFor = (checklistKey: string | null | undefined): DocumentGroupId | null =>
  (checklistKey ? CHECKLIST_GROUPS[checklistKey] ?? null : null);

/** The groups to show: with a focus only that one; otherwise the always-shown groups and those holding files. */
export const visibleDocumentGroups = <T extends Pick<HrmDocument, 'category'>>(documents: readonly T[], focus: DocumentGroupId | null) =>
  DOCUMENT_GROUPS
    .map((item) => ({ ...item, documents: documents.filter((document) => (item.categories as string[]).includes(document.category)) }))
    .filter((item) => (focus ? item.id === focus : item.always || item.documents.length > 0));

type OriginFacts = { provider?: string | null; metadata?: Record<string, unknown> | null; uploadedById?: string | null };

export type DocumentOrigin = 'OFFER' | 'KYC' | 'EMPLOYEE' | 'HR';
export const DOCUMENT_ORIGIN_LABELS: Record<DocumentOrigin, string> = {
  OFFER: 'From offer (automatic)', KYC: 'KYC verification', EMPLOYEE: 'Uploaded by employee', HR: 'Uploaded by HR',
};

export const documentOrigin = (document: OriginFacts, employeeUserId: string | null): DocumentOrigin => {
  if (document.metadata?.source === 'RECRUITMENT_OFFER') return 'OFFER';
  if (document.provider === 'SUREPASS') return 'KYC';
  return document.uploadedById && document.uploadedById === employeeUserId ? 'EMPLOYEE' : 'HR';
};

const OFFER_KINDS: Record<string, string> = {
  OFFER_LETTER: 'Letter sent to candidate',
  SIGNED_OFFER_LETTER: 'Signed offer letter',
  ACCEPTANCE_CERTIFICATE: 'Acceptance certificate',
};
/** What a file is, inside a group that holds more than one type. */
export const documentKindLabel = (document: Pick<HrmDocument, 'category' | 'metadata'>) => {
  const kind = typeof document.metadata?.kind === 'string' ? OFFER_KINDS[document.metadata.kind] : undefined;
  if (kind) return kind;
  if (document.category === 'ACCEPTANCE') return 'Signed offer letter';
  return DOCUMENT_CATEGORY_LABELS[document.category as HrmDocumentCategory] ?? document.category;
};

/** The title an upload starts with. */
export const defaultDocumentTitle = (category: HrmDocumentCategory) =>
  (category === 'OTHER' ? '' : category === 'ACCEPTANCE' ? 'Signed offer letter' : DOCUMENT_CATEGORY_LABELS[category]);
