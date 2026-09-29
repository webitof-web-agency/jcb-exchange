export type OfferLetterFormData = {
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

export const emptyOfferLetterData: OfferLetterFormData = {
  letterDate: '',
  offerLetterNo: '',
  employeeName: '',
  employeeAddress: '',
  companyName: 'JCB Exchange',
  companyAddress: '',
  designation: '',
  department: '',
  placeOfPosting: '',
  salaryAmount: '',
  salaryPeriod: 'annum',
  joiningDate: '',
  probationPeriod: '6',
  noticePeriod: '30',
  signatoryName: '',
  signatoryDesignation: '',
  signatoryDate: '',
  signatoryPlace: '',
  acceptanceDate: '',
  acceptancePlace: '',
  additionalTerms: '',
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

export const buildOfferLetterTerms = (data: OfferLetterFormData) => [
  `You are required to join ${data.companyName || 'the Company'} on or before the date of joining specified above. This offer shall stand cancelled if you fail to join within the stipulated period without prior written approval of the Company.`,
  `You shall perform such duties and responsibilities as may be assigned to you from time to time in accordance with your position and the requirements of ${data.companyName || 'the Company'}.`,
  `Your salary shall be as specified above and shall be subject to applicable statutory deductions, taxes and other applicable provisions.`,
  `You shall abide by all rules, regulations, policies, procedures and instructions of ${data.companyName || 'the Company'} as may be applicable from time to time.`,
  `During your employment, you shall maintain strict confidentiality regarding all confidential information, business information, client information, records, documents, data and other proprietary information of ${data.companyName || 'the Company'}.`,
  `Your employment shall be subject to satisfactory verification of the information and documents furnished by you, including educational qualifications, experience and other credentials.`,
  `You shall devote your full professional time and attention to the duties assigned to you and shall maintain proper discipline, integrity and professional conduct during your employment.`,
  `Your employment shall initially be subject to a probation period of ${data.probationPeriod || '[ ]'} months. Upon satisfactory performance, your employment may be confirmed in accordance with the Company's policies.`,
  `Your employment may be terminated by either party by giving ${data.noticePeriod || '[ ]'} days' notice or salary in lieu thereof, subject to the Company's applicable policies and the terms of your employment.`,
  `You shall be responsible for complying with all applicable laws, Company policies and professional requirements relevant to your role.`,
  `Any amendment or modification to the terms of this offer shall be made only with the written approval of ${data.companyName || 'the Company'}.`,
  `This offer letter, together with ${data.companyName || "the Company's"} policies and other applicable employment documents, shall constitute the terms governing your employment with the Company.`,
  `We are pleased to have you join ${data.companyName || 'the Company'} and look forward to a mutually beneficial and successful association with you.`,
  'Kindly sign and return a copy of this letter as a token of your acceptance.',
  ...(data.additionalTerms.trim() ? data.additionalTerms.split(/\r?\n+/).map((term) => term.trim()).filter(Boolean) : []),
];
