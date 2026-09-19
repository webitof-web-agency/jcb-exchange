export type ListingRtoFormState = {
  hirePurchaseStatus: 'PENDING' | 'ACTIVE' | 'TERMINATED' | 'NOT_APPLICABLE';
  taxStatus: 'VALID' | 'EXPIRED';
  taxValidUntil: string;
  fitnessStatus: 'VALID' | 'EXPIRED';
  fitnessValidUntil: string;
  insuranceStatus: 'VALID' | 'EXPIRED';
  pucStatus: 'VALID' | 'EXPIRED';
  pucValidUntil: string;
  hsrpStatus: 'YES' | 'NO';
  rtoOffice: string;
  rtoAgentName: string;
  rtoExpenses: string;
  vehicleMaintenanceCost: string;
};

export const emptyListingRtoForm: ListingRtoFormState = {
  hirePurchaseStatus: 'PENDING',
  taxStatus: 'VALID',
  taxValidUntil: '',
  fitnessStatus: 'VALID',
  fitnessValidUntil: '',
  insuranceStatus: 'VALID',
  pucStatus: 'VALID',
  pucValidUntil: '',
  hsrpStatus: 'NO',
  rtoOffice: '',
  rtoAgentName: '',
  rtoExpenses: '',
  vehicleMaintenanceCost: '',
};

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const uppercaseText = (value: string) => value.toUpperCase().trimStart();

export const sanitizeListingRtoForm = (form: ListingRtoFormState): ListingRtoFormState => ({
  ...form,
  taxValidUntil: form.taxValidUntil.trim(),
  fitnessValidUntil: form.fitnessValidUntil.trim(),
  insuranceStatus: form.insuranceStatus,
  pucValidUntil: form.pucValidUntil.trim(),
  rtoOffice: uppercaseText(form.rtoOffice),
  rtoAgentName: uppercaseText(form.rtoAgentName),
  rtoExpenses: digitsOnly(form.rtoExpenses),
  vehicleMaintenanceCost: digitsOnly(form.vehicleMaintenanceCost),
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
    ['Tax Validity', form.taxStatus, form.taxValidUntil],
    ['Fitness Validity', form.fitnessStatus, form.fitnessValidUntil],
    ['Insurance Validity', form.insuranceStatus, base.insuranceExpiry],
    ['PUC Validity', form.pucStatus, form.pucValidUntil],
  ];
  const missingValidity = validityChecks.find(([, status, date]) => !status || !date.trim());
  if (missingValidity) return `${missingValidity[0]} status and date are required.`;
  if (!form.hsrpStatus) return 'HSRP Valid is required.';
  if (!form.rtoOffice.trim()) return 'RTO Office is required.';
  if (!form.rtoAgentName.trim()) return 'RTO Agent Name is required.';
  if (Number(form.rtoExpenses) <= 0) return 'RTO Expenses is required.';
  if (Number(form.vehicleMaintenanceCost) <= 0) return 'Vehicle Maintenance Cost is required.';
  if (Number(base.operatingHours) <= 0) return 'Hours Running is required.';
  return null;
};

export const buildListingRtoDetails = (
  form: ListingRtoFormState,
  base: { registrationNo: string; vehicleType: string; vehicleModel: string; operatingHours: string; insuranceExpiry: string },
) => ({
  ...form,
  registrationNo: base.registrationNo,
  vehicleType: base.vehicleType,
  vehicleModel: base.vehicleModel,
  operatingHours: base.operatingHours,
  insuranceValidUntil: base.insuranceExpiry,
});
