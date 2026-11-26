/**
 * The joining checklist (pure: no database). The onboarding service gathers the facts for each person; this turns
 * them into the items HR sees. A document counts as done once verified; uploaded but not yet verified shows as
 * PENDING. LOGIN is shown for information only: the login is created at Confirm joining.
 */

export type DocumentState = 'VERIFIED' | 'PENDING' | 'MISSING';
export type ChecklistState = 'DONE' | 'PENDING' | 'MISSING';

export type ChecklistFacts = {
  personal: { dateOfBirth: boolean; gender: boolean; currentAddress: boolean; emergencyContact: boolean };
  hasPlacement: boolean;
  panVerified: boolean;
  aadhaarVerified: boolean;
  bank: 'VERIFIED' | 'ADDED' | 'MISSING';
  documents: Record<'OFFER' | 'ACCEPTANCE' | 'PHOTO' | 'ADDRESS' | 'EDUCATION', DocumentState>;
  salary: 'APPROVED' | 'PENDING' | 'MISSING';
  hasShift: boolean;
  hasLogin: boolean;
};

export type ChecklistItem = {
  key: string;
  label: string;
  required: boolean;
  /** Counted in the progress (LOGIN is not: it is done at Confirm joining). */
  counted: boolean;
  state: ChecklistState;
  hint: string;
};

const fromDocument = (state: DocumentState): ChecklistState => (state === 'VERIFIED' ? 'DONE' : state === 'PENDING' ? 'PENDING' : 'MISSING');

export const buildChecklist = (facts: ChecklistFacts): ChecklistItem[] => {
  const missingPersonal = [
    !facts.personal.dateOfBirth && 'date of birth',
    !facts.personal.gender && 'gender',
    !facts.personal.currentAddress && 'current address',
    !facts.personal.emergencyContact && 'emergency contact',
  ].filter(Boolean) as string[];
  return [
    { key: 'PERSONAL', label: 'Personal details', required: true, counted: true, state: missingPersonal.length ? 'MISSING' : 'DONE', hint: missingPersonal.length ? `Add ${missingPersonal.join(', ')}.` : 'Date of birth, gender, address and emergency contact are filled.' },
    { key: 'PLACEMENT', label: 'Department, designation and office', required: true, counted: true, state: facts.hasPlacement ? 'DONE' : 'MISSING', hint: facts.hasPlacement ? 'Assignment recorded.' : 'Add the assignment in the Job tab.' },
    { key: 'PAN', label: 'PAN verified', required: true, counted: true, state: facts.panVerified ? 'DONE' : 'MISSING', hint: facts.panVerified ? 'Verified.' : 'Verify PAN in KYC & Bank.' },
    { key: 'AADHAAR', label: 'Aadhaar verified', required: true, counted: true, state: facts.aadhaarVerified ? 'DONE' : 'MISSING', hint: facts.aadhaarVerified ? 'Verified.' : 'Verify Aadhaar in KYC & Bank.' },
    { key: 'BANK', label: 'Salary bank account', required: true, counted: true, state: facts.bank === 'VERIFIED' ? 'DONE' : facts.bank === 'ADDED' ? 'PENDING' : 'MISSING', hint: facts.bank === 'VERIFIED' ? 'Primary account verified.' : facts.bank === 'ADDED' ? 'Primary account added, not verified yet.' : 'Add the primary bank account in KYC & Bank.' },
    { key: 'OFFER_LETTER', label: 'Offer letter', required: true, counted: true, state: fromDocument(facts.documents.OFFER), hint: facts.documents.OFFER === 'MISSING' ? 'Upload the offer letter in Documents.' : facts.documents.OFFER === 'PENDING' ? 'Uploaded, waiting for verification.' : 'On file.' },
    { key: 'ACCEPTANCE', label: 'Signed acceptance', required: true, counted: true, state: fromDocument(facts.documents.ACCEPTANCE), hint: facts.documents.ACCEPTANCE === 'MISSING' ? 'Upload the signed offer letter in Documents.' : facts.documents.ACCEPTANCE === 'PENDING' ? 'Uploaded, waiting for verification.' : 'On file.' },
    { key: 'PHOTO', label: 'Passport photo', required: true, counted: true, state: fromDocument(facts.documents.PHOTO), hint: facts.documents.PHOTO === 'MISSING' ? 'Upload a passport-size photo in Documents.' : facts.documents.PHOTO === 'PENDING' ? 'Uploaded, waiting for verification.' : 'On file.' },
    { key: 'ADDRESS_PROOF', label: 'Address proof', required: false, counted: false, state: facts.aadhaarVerified ? 'DONE' : fromDocument(facts.documents.ADDRESS), hint: facts.aadhaarVerified ? 'Covered by the verified Aadhaar.' : 'Optional when Aadhaar is verified.' },
    { key: 'EDUCATION', label: 'Education certificates', required: false, counted: false, state: fromDocument(facts.documents.EDUCATION), hint: 'Optional.' },
    { key: 'SALARY', label: 'Salary approved', required: true, counted: true, state: facts.salary === 'APPROVED' ? 'DONE' : facts.salary === 'PENDING' ? 'PENDING' : 'MISSING', hint: facts.salary === 'APPROVED' ? 'Approved.' : facts.salary === 'PENDING' ? 'Waiting for approval.' : 'Propose the salary in the Salary tab.' },
    { key: 'SHIFT', label: 'Shift and weekly off', required: true, counted: true, state: facts.hasShift ? 'DONE' : 'MISSING', hint: facts.hasShift ? 'Assigned.' : 'Assign a shift in the Shift tab.' },
    { key: 'LOGIN', label: 'Login account', required: false, counted: false, state: facts.hasLogin ? 'DONE' : 'MISSING', hint: facts.hasLogin ? 'Has a login.' : 'Created at Confirm joining.' },
  ];
};

export const checklistProgress = (items: readonly ChecklistItem[]) => {
  const counted = items.filter((item) => item.counted);
  const done = counted.filter((item) => item.state === 'DONE').length;
  return { done, total: counted.length, percent: counted.length ? Math.round((done / counted.length) * 100) : 0, missingRequired: counted.filter((item) => item.required && item.state !== 'DONE').map((item) => item.key) };
};

/** Best state of a set of documents of one category (verified beats pending; rejected / archived do not count). */
export const documentState = (statuses: readonly string[]): DocumentState =>
  statuses.includes('VERIFIED') ? 'VERIFIED' : statuses.includes('PENDING') ? 'PENDING' : 'MISSING';
