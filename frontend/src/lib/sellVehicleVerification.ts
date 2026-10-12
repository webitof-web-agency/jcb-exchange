import type { ListingRtoFormState } from './listingRtoForm';

type ProviderVehicleResult = Record<string, unknown>;

export type VehicleVerificationAutofill = {
  registrationNo: string;
  chassisOrSerialNo: string;
  engineNumber: string;
  categoryName: string;
  brandName: string;
  model: string;
  variant: string;
  fuelType: string;
  manufacturingYear: string;
  registrationYear: string;
  previousOwners: string;
  titleSuggestion: string;
  insuranceExpiry: string;
  rtoDetails: Pick<
    ListingRtoFormState,
    | 'hirePurchaseStatus'
    | 'taxStatus'
    | 'taxValidUntil'
    | 'fitnessStatus'
    | 'fitnessValidUntil'
    | 'insuranceStatus'
    | 'pucStatus'
    | 'pucValidUntil'
    | 'rtoOffice'
  >;
};

export type ProviderValidityStatus = 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE';

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeChassis = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, '');

export const getChassisSubmitValidationError = (
  chassisNumber: unknown,
  verifiedChassisNumber: unknown,
  isAdmin: boolean,
) => {
  if (isAdmin) return null;
  const current = normalizeChassis(chassisNumber);
  const verified = normalizeChassis(verifiedChassisNumber);
  if (!current) return 'Chassis number is required before posting this vehicle.';
  if (!verified) return 'Verify the chassis number before posting this vehicle.';
  if (current !== verified) return 'Verify the current chassis number before posting this vehicle.';
  return null;
};

const validIsoDate = (value: unknown) => {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return '';
  const [year, month, day] = candidate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return '';
  return candidate;
};

const dateOnly = (value: unknown) => validIsoDate(value);

const yearFrom = (value: unknown) => {
  const candidate = text(value);
  const match = /^(\d{4})/.exec(candidate) || /(\d{4})$/.exec(candidate);
  return match?.[1] || '';
};

const optionLabel = (value: unknown, options: readonly string[]) => {
  const normalized = text(value).toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) || text(value);
};

export const getProviderDateStatus = (
  value: unknown,
  now = new Date(),
): ProviderValidityStatus => {
  const candidate = validIsoDate(value);
  if (!candidate) return 'NOT_AVAILABLE';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [year, month, day] = candidate.split('-').map(Number);
  const expiry = new Date(year, month - 1, day);
  return expiry.getTime() >= today.getTime() ? 'VALID' : 'EXPIRED';
};

export const mapChassisToRcVehicle = (
  result: ProviderVehicleResult,
  now = new Date(),
): VehicleVerificationAutofill => {
  const registrationNo = text(result.rcNumber ?? result.rc_number);
  const chassisOrSerialNo = text(result.vehicleChasiNumber ?? result.vehicle_chasi_number);
  const engineNumber = text(result.vehicleEngineNumber ?? result.vehicle_engine_number);
  const categoryName = text(
    result.vehicleCategoryDescription
      ?? result.vehicle_category_description
      ?? result.vehicleCategory
      ?? result.vehicle_category,
  );
  const brandName = text(result.makerDescription ?? result.maker_description);
  const model = text(result.makerModel ?? result.maker_model);
  const variant = text(result.variant);
  const fuelType = optionLabel(result.fuelType ?? result.fuel_type, ['Diesel', 'Electric', 'Petrol', 'Hybrid', 'Other']);
  const manufacturingYear = yearFrom(result.manufacturingDateFormatted ?? result.manufacturing_date_formatted ?? result.manufacturingDate ?? result.manufacturing_date);
  const registrationYear = yearFrom(result.registrationDate ?? result.registration_date);
  const previousOwners = text(result.ownerNumber ?? result.owner_number);
  const insuranceExpiry = dateOnly(result.insuranceUpto ?? result.insurance_upto);
  const fitnessValidUntil = dateOnly(result.fitUpTo ?? result.fit_up_to);
  const taxValidUntil = dateOnly(result.taxUpto ?? result.tax_upto ?? result.taxPaidUpto ?? result.tax_paid_upto);
  const pucValidUntil = dateOnly(result.puccUpto ?? result.pucc_upto);
  const taxStatus = taxValidUntil ? getProviderDateStatus(taxValidUntil, now) : 'NOT_AVAILABLE';
  const fitnessStatus = fitnessValidUntil ? getProviderDateStatus(fitnessValidUntil, now) : 'NOT_AVAILABLE';
  const insuranceStatus = insuranceExpiry ? getProviderDateStatus(insuranceExpiry, now) : 'NOT_AVAILABLE';
  const pucStatus = pucValidUntil ? getProviderDateStatus(pucValidUntil, now) : 'NOT_AVAILABLE';
  const financed = result.financed;

  return {
    registrationNo,
    chassisOrSerialNo,
    engineNumber,
    categoryName,
    brandName,
    model,
    variant,
    fuelType,
    manufacturingYear,
    registrationYear,
    previousOwners,
    titleSuggestion: [brandName, model].filter(Boolean).join(' '),
    insuranceExpiry: insuranceStatus === 'VALID' ? insuranceExpiry : '',
    rtoDetails: {
      hirePurchaseStatus: financed === true ? 'ACTIVE' : financed === false ? 'NOT_APPLICABLE' : 'PENDING',
      taxStatus,
      taxValidUntil: taxStatus === 'VALID' ? taxValidUntil : '',
      fitnessStatus,
      fitnessValidUntil: fitnessStatus === 'VALID' ? fitnessValidUntil : '',
      insuranceStatus,
      pucStatus,
      pucValidUntil: pucStatus === 'VALID' ? pucValidUntil : '',
      rtoOffice: text(result.registeredAt ?? result.registered_at),
    },
  };
};
