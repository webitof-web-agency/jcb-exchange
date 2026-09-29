export type OfferLetterData = {
  letterDate: string;
  offerLetterNo: string;
  employeeName: string;
  employeeAddress: string;
  companyName: string;
  companyAddress: string;
  designation: string;
  department: string;
  placeOfPosting: string;
  salaryAmount: string;
  salaryPeriod: string;
  joiningDate: string;
  probationPeriod: string;
  noticePeriod: string;
  signatoryName: string;
  signatoryDesignation: string;
  signatoryDate: string;
  signatoryPlace: string;
  acceptanceDate: string;
  acceptancePlace: string;
  additionalTerms: string;
};

const text = (value: unknown, maxLength: number) => String(value ?? '').trim().slice(0, maxLength);

export const normalizeOfferLetterData = (input: Partial<OfferLetterData>): OfferLetterData => ({
  letterDate: text(input.letterDate, 32),
  offerLetterNo: text(input.offerLetterNo, 80),
  employeeName: text(input.employeeName, 160),
  employeeAddress: text(input.employeeAddress, 500),
  companyName: text(input.companyName, 160),
  companyAddress: text(input.companyAddress, 500),
  designation: text(input.designation, 160),
  department: text(input.department, 160),
  placeOfPosting: text(input.placeOfPosting, 160),
  salaryAmount: text(input.salaryAmount, 40).replace(/,/g, ''),
  salaryPeriod: text(input.salaryPeriod, 40),
  joiningDate: text(input.joiningDate, 32),
  probationPeriod: text(input.probationPeriod, 40),
  noticePeriod: text(input.noticePeriod, 40),
  signatoryName: text(input.signatoryName, 160),
  signatoryDesignation: text(input.signatoryDesignation, 160),
  signatoryDate: text(input.signatoryDate, 32),
  signatoryPlace: text(input.signatoryPlace, 160),
  acceptanceDate: text(input.acceptanceDate, 32),
  acceptancePlace: text(input.acceptancePlace, 160),
  additionalTerms: text(input.additionalTerms, 4000),
});

export const validateOfferLetterData = (data: OfferLetterData) => {
  const errors: string[] = [];
  if (!data.employeeName) errors.push('Employee name is required.');
  if (!data.companyName) errors.push('Company name is required.');
  if (!data.designation) errors.push('Designation is required.');
  if (!data.department) errors.push('Department is required.');
  if (!data.placeOfPosting) errors.push('Place of posting is required.');
  if (!data.salaryAmount || Number.isNaN(Number(data.salaryAmount)) || Number(data.salaryAmount) <= 0) {
    errors.push('A valid salary amount is required.');
  }
  if (!data.salaryPeriod) errors.push('Salary period is required.');
  if (!data.joiningDate) errors.push('Joining date is required.');
  if (!data.probationPeriod) errors.push('Probation period is required.');
  if (!data.noticePeriod) errors.push('Notice period is required.');
  if (!data.signatoryName) errors.push('Authorized signatory name is required.');
  if (!data.signatoryDesignation) errors.push('Authorized signatory designation is required.');
  return errors;
};

export const formatOfferDate = (value: string) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};
