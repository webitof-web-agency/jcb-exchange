export type ListingRtoFormState = {
  hirePurchaseStatus: 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'NOT_APPLICABLE';
  taxStatus: 'VALID' | 'EXPIRED' | 'LIFETIME' | 'NOT_AVAILABLE';
  taxValidUntil: string;
  fitnessStatus: 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE';
  fitnessValidUntil: string;
  insuranceStatus: 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE';
  pucStatus: 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE';
  pucValidUntil: string;
  hsrpStatus: 'YES' | 'NO' | 'PENDING' | 'NOT_APPLICABLE';
  rtoOffice: string;
  rtoAgentName: string;
  rtoExpenses: string;
  vehicleMaintenanceCost: string;
};

export const emptyListingRtoForm: ListingRtoFormState = {
  hirePurchaseStatus: 'PENDING', taxStatus: 'NOT_AVAILABLE', taxValidUntil: '', fitnessStatus: 'NOT_AVAILABLE', fitnessValidUntil: '',
  insuranceStatus: 'NOT_AVAILABLE', pucStatus: 'NOT_AVAILABLE', pucValidUntil: '', hsrpStatus: 'PENDING', rtoOffice: '', rtoAgentName: '',
  rtoExpenses: '', vehicleMaintenanceCost: '',
};

const sanitizeDigits = (value: string) => value.replace(/\D/g, '');
const sanitizeUppercase = (value: string) => value.toUpperCase().trimStart();

export const sanitizeListingRtoForm = (form: ListingRtoFormState): ListingRtoFormState => ({
  ...form,
  taxValidUntil: form.taxStatus === 'VALID' ? form.taxValidUntil.trim() : '',
  fitnessValidUntil: form.fitnessStatus === 'VALID' ? form.fitnessValidUntil.trim() : '',
  pucValidUntil: form.pucStatus === 'VALID' ? form.pucValidUntil.trim() : '',
  rtoOffice: sanitizeUppercase(form.rtoOffice),
  rtoAgentName: sanitizeUppercase(form.rtoAgentName), rtoExpenses: sanitizeDigits(form.rtoExpenses),
  vehicleMaintenanceCost: sanitizeDigits(form.vehicleMaintenanceCost),
});

export const hasListingRtoInput = (form: ListingRtoFormState) => Boolean(
  form.taxValidUntil.trim() || form.fitnessValidUntil.trim() || form.pucValidUntil.trim()
  || form.rtoOffice.trim() || form.rtoAgentName.trim() || form.rtoExpenses || form.vehicleMaintenanceCost,
);

export const validateListingRtoForm = (
  form: ListingRtoFormState,
  base: { registrationNo: string; vehicleType: string; vehicleModel: string; operatingHours: string; insuranceExpiry: string },
) => {
  if (!base.registrationNo.trim()) return 'Vehicle Number is required.';
  if (!base.vehicleType.trim()) return 'Vehicle Type is required.';
  if (!base.vehicleModel.trim()) return 'Vehicle Model is required.';
  if (!form.hirePurchaseStatus) return 'Hire Purchase is required.';
  const validityChecks: Array<[string, string, string]> = [
    ['Tax Validity', form.taxStatus, form.taxStatus === 'VALID' ? form.taxValidUntil : 'skip'],
    ['Fitness Validity', form.fitnessStatus, form.fitnessStatus === 'VALID' ? form.fitnessValidUntil : 'skip'],
    ['Insurance Validity', form.insuranceStatus, form.insuranceStatus === 'VALID' ? base.insuranceExpiry : 'skip'],
    ['PUC Validity', form.pucStatus, form.pucStatus === 'VALID' ? form.pucValidUntil : 'skip'],
  ];
  const missingValidity = validityChecks.find(([, status, date]) => !status || !date.trim());
  if (missingValidity) return `${missingValidity[0]} status and date are required.`;
  if (!form.rtoOffice.trim()) return 'RTO Office is required.';
  if (Number(form.vehicleMaintenanceCost) <= 0) return 'Vehicle Maintenance Cost is required.';
  if (Number(base.operatingHours) <= 0) return 'Hours Running is required.';
  return null;
};

export const buildListingRtoDetails = (
  form: ListingRtoFormState,
  base: { registrationNo: string; vehicleType: string; vehicleModel: string; operatingHours: string; insuranceExpiry: string },
) => ({
  ...sanitizeListingRtoForm(form),
  registrationNo: base.registrationNo,
  vehicleType: base.vehicleType,
  vehicleModel: base.vehicleModel,
  operatingHours: base.operatingHours,
  insuranceValidUntil: form.insuranceStatus === 'VALID' ? base.insuranceExpiry : '',
});
