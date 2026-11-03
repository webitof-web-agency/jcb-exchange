import type { ListingRtoFormState } from './listingRtoForm';

type ProviderVehicleResult = Record<string, unknown>;

export type VehicleVerificationAutofill = {
  registrationNo: string;
  chassisOrSerialNo: string;
  ownerName: string;
  engineNumber: string;
  categoryName: string;
  brandName: string;
  model: string;
  variant: string;
  fuelType: string;
  transmission?: string;
  grossPower?: string;
  manufacturingYear: string;
  registrationDate: string;
  registrationUpto: string;
  previousOwners: string;
  titleSuggestion: string;
  insuranceExpiry: string;
  rtoDetails: Omit<Pick<
    ListingRtoFormState,
    | 'hirePurchaseStatus'
    | 'financerName'
    | 'taxStatus'
    | 'taxValidUntil'
    | 'fitnessStatus'
    | 'fitnessValidUntil'
    | 'insuranceStatus'
    | 'pucStatus'
    | 'pucValidUntil'
    | 'hsrpStatus'
    | 'hsrpNumber'
    | 'rtoOffice'
  >, 'hsrpStatus'> & { hsrpStatus?: ListingRtoFormState['hsrpStatus'] };
};

export type ProviderValidityStatus = 'VALID' | 'EXPIRED' | 'NOT_AVAILABLE';
export type VehicleVerificationSource = 'CHASSIS' | 'RC_FULL';

export type VehicleVerificationButtonState = {
  isLoading: boolean;
  isVerified: boolean;
  isLocked: boolean;
};

export const getVehicleVerificationButtonState = (
  source: VehicleVerificationSource,
  loadingSource: VehicleVerificationSource | '',
  verifiedSource: VehicleVerificationSource | '',
): VehicleVerificationButtonState => ({
  isLoading: loadingSource === source,
  isVerified: verifiedSource === source,
  isLocked: Boolean(
    (loadingSource && loadingSource !== source)
    || (verifiedSource && verifiedSource !== source),
  ),
});

const text = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const firstText = (...values: unknown[]) => values.map(text).find(Boolean) || '';

const firstProviderValue = (...values: unknown[]) => values.find((value) => (
  value !== null
  && value !== undefined
  && !(typeof value === 'string' && value.trim() === '')
));

const providerObject = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const providerData = (result: ProviderVehicleResult) => {
  const nested = [result.details, result.data, result.vehicle, result.rcDetails, result.rc_details]
    .map(providerObject)
    .filter((value): value is Record<string, unknown> => Boolean(value));
  const merged = nested.reduce<Record<string, unknown>>((accumulator, value) => {
    Object.entries(value).forEach(([key, item]) => {
      if (item !== null && item !== undefined && !(typeof item === 'string' && item.trim() === '')) accumulator[key] = item;
    });
    return accumulator;
  }, {});
  Object.entries(result).forEach(([key, item]) => {
    if (item !== null && item !== undefined && !(typeof item === 'string' && item.trim() === '')) merged[key] = item;
  });
  return merged;
};

const providerBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (['true', 'yes', 'y', '1', 'active', 'financed'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0', 'none', 'na', 'not_applicable', 'not_financed', 'not_available', 'no_finance'].includes(normalized)) return false;
  return undefined;
};

const normalizeChassis = (value: unknown) => text(value).toUpperCase().replace(/\s+/g, '');

export const normalizeRegistrationNumber = (value: unknown) =>
  text(value).toUpperCase().replace(/[\s/-]+/g, '');

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

export type VehicleVerificationSubmitValidationInput = {
  required: boolean;
  source: VehicleVerificationSource | '';
  currentRegistrationNumber: unknown;
  currentChassisNumber: unknown;
  verifiedRegistrationNumber: unknown;
  verifiedChassisNumber: unknown;
  verifiedSource: VehicleVerificationSource | '';
  isAdmin?: boolean;
};

export const getVehicleVerificationSubmitValidationError = ({
  required,
  source,
  currentRegistrationNumber,
  currentChassisNumber,
  verifiedRegistrationNumber,
  verifiedChassisNumber,
  verifiedSource,
  isAdmin = false,
}: VehicleVerificationSubmitValidationInput) => {
  if (!required || isAdmin) return null;

  const currentRegistration = normalizeRegistrationNumber(currentRegistrationNumber);
  const currentChassis = normalizeChassis(currentChassisNumber);
  const verifiedRegistration = normalizeRegistrationNumber(verifiedRegistrationNumber);
  const verifiedChassis = normalizeChassis(verifiedChassisNumber);

  if (!currentChassis) return 'Chassis number is required before posting this vehicle.';
  if (!source || source !== verifiedSource || !verifiedChassis) {
    return 'Verify the current vehicle identity before posting this vehicle.';
  }
  if (source === 'RC_FULL' && !currentRegistration) {
    return 'Vehicle number is required before RC verification.';
  }
  if (currentChassis !== verifiedChassis) {
    return 'Verify the current chassis number before posting this vehicle.';
  }
  if (source === 'RC_FULL' && (!verifiedRegistration || currentRegistration !== verifiedRegistration)) {
    return 'Verify the current vehicle number before posting this vehicle.';
  }
  if (source === 'CHASSIS' && currentRegistration && verifiedRegistration && currentRegistration !== verifiedRegistration) {
    return 'Verify the current vehicle number before posting this vehicle.';
  }
  return null;
};

const validProviderDate = (value: unknown) => {
  const candidate = text(value).split('T')[0].trim().replace(/[/.]/g, '-');
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(candidate);
  const dmyMatch = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(candidate);
  const year = Number(isoMatch?.[1] || dmyMatch?.[3] || 0);
  const month = Number(isoMatch?.[2] || dmyMatch?.[2] || 0);
  const day = Number(isoMatch?.[3] || dmyMatch?.[1] || 0);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return '';
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const dateOnly = (value: unknown) => validProviderDate(value);

const yearFrom = (value: unknown) => {
  const candidate = text(value);
  const match = /^(\d{4})/.exec(candidate) || /(\d{4})$/.exec(candidate);
  return match?.[1] || '';
};

const optionLabel = (value: unknown, options: readonly string[]) => {
  const normalized = text(value).toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) || text(value);
};

const normalizeValidityStatus = (value: unknown): ProviderValidityStatus | 'LIFETIME' | '' => {
  const normalized = text(value).toLowerCase().replace(/[-\s]+/g, '_');
  if (['valid', 'active', 'yes', 'y', 'ok'].includes(normalized)) return 'VALID';
  if (['expired', 'inactive', 'no', 'n'].includes(normalized)) return 'EXPIRED';
  if (['lifetime', 'llt'].includes(normalized)) return 'LIFETIME';
  if (['not_available', 'unavailable', 'na', 'not_applicable', 'none'].includes(normalized)) return 'NOT_AVAILABLE';
  return '';
};

const normalizeHsrpStatus = (value: unknown): ListingRtoFormState['hsrpStatus'] | '' => {
  const normalized = text(value).toLowerCase().replace(/[-\s]+/g, '_');
  if (['yes', 'y', 'true', '1', 'active', 'valid', 'available', 'fitted'].includes(normalized)) return 'YES';
  if (['no', 'n', 'false', '0', 'not_fitted'].includes(normalized)) return 'NO';
  if (['pending', 'in_process', 'processing'].includes(normalized)) return 'PENDING';
  if (['not_applicable', 'not_required', 'na', 'none'].includes(normalized)) return 'NOT_APPLICABLE';
  return '';
};

const isHsrpStatusToken = (value: unknown) => Boolean(normalizeHsrpStatus(value));

export const getProviderDateStatus = (
  value: unknown,
  now = new Date(),
): ProviderValidityStatus => {
  const candidate = validProviderDate(value);
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
  const data = providerData(result);
  const registrationNo = firstText(data.rcNumber, data.rc_number, data.registrationNumber, data.registration_number, data.regNo, data.reg_no);
  const chassisOrSerialNo = firstText(data.vehicleChasiNumber, data.vehicle_chasi_number, data.vehicleChassisNumber, data.vehicle_chassis_number, data.chassisNumber, data.chassis_number, data.serialNumber, data.serial_number);
  const ownerName = firstText(data.ownerName, data.owner_name, data.ownerFullName, data.owner_full_name, data.currentOwnerName, data.current_owner_name);
  const engineNumber = firstText(data.vehicleEngineNumber, data.vehicle_engine_number, data.engineNumber, data.engine_number);
  const categoryName = firstText(data.vehicleCategoryDescription, data.vehicle_category_description, data.vehicleCategory, data.vehicle_category, data.categoryName, data.category_name);
  const brandName = firstText(data.makerDescription, data.maker_description, data.maker, data.brandName, data.brand_name, data.manufacturer);
  const model = firstText(data.makerModel, data.maker_model, data.model, data.vehicleModel, data.vehicle_model);
  const variant = firstText(data.variant, data.vehicleVariant, data.vehicle_variant, data.modelVariant, data.model_variant);
  const fuelType = optionLabel(firstText(data.fuelType, data.fuel_type), ['Diesel', 'Electric', 'Petrol', 'Hybrid', 'Other']);
  const transmission = firstText(data.transmission, data.transmissionType, data.transmission_type, data.gearType, data.gear_type);
  const grossPower = firstText(data.grossPower, data.gross_power, data.horsePower, data.horse_power, data.power, data.maxPower, data.max_power);
  const manufacturingYear = yearFrom(firstText(data.manufacturingDateFormatted, data.manufacturing_date_formatted, data.manufacturingDate, data.manufacturing_date));
  const registrationDate = dateOnly(firstText(data.registrationDate, data.registration_date));
  const registrationUpto = dateOnly(firstText(data.registrationUpto, data.registration_upto, data.registrationValidUpto, data.registration_valid_upto, data.rcValidUpto, data.rc_valid_upto, data.rcExpiryDate, data.rc_expiry_date));
  const previousOwners = firstText(data.ownerNumber, data.owner_number, data.currentOwnerNumber, data.current_owner_number);
  const insuranceExpiry = dateOnly(firstText(data.insuranceUpto, data.insurance_upto, data.insuranceValidUpto, data.insurance_valid_upto, data.insuranceExpiryDate, data.insurance_expiry_date));
  const fitnessValidUntil = dateOnly(firstText(data.fitUpTo, data.fit_up_to, data.fitnessUpto, data.fitness_upto, data.fitnessValidUpto, data.fitness_valid_upto));
  const taxValidUntil = dateOnly(firstText(data.taxUpto, data.tax_upto, data.taxPaidUpto, data.tax_paid_upto, data.taxValidUpto, data.tax_valid_upto));
  const pucValidUntil = dateOnly(firstText(data.puccUpto, data.pucc_upto, data.pucUpto, data.puc_upto, data.pucValidUpto, data.puc_valid_upto));
  const taxStatusFromProvider = normalizeValidityStatus(firstText(data.taxStatus, data.tax_status, data.taxValidity, data.tax_validity));
  const fitnessStatusFromProvider = normalizeValidityStatus(firstText(data.fitnessStatus, data.fitness_status, data.fitnessValidity, data.fitness_validity));
  const insuranceStatusFromProvider = normalizeValidityStatus(firstText(data.insuranceStatus, data.insurance_status, data.insuranceValidity, data.insurance_validity));
  const pucStatusFromProvider = normalizeValidityStatus(firstText(data.pucStatus, data.puc_status, data.pucValidity, data.puc_validity));
  const taxStatus = taxValidUntil ? getProviderDateStatus(taxValidUntil, now) : taxStatusFromProvider || 'NOT_AVAILABLE';
  const fitnessStatus = fitnessValidUntil ? getProviderDateStatus(fitnessValidUntil, now) : fitnessStatusFromProvider === 'LIFETIME' ? 'VALID' : fitnessStatusFromProvider || 'NOT_AVAILABLE';
  const insuranceStatus = insuranceExpiry ? getProviderDateStatus(insuranceExpiry, now) : insuranceStatusFromProvider === 'LIFETIME' ? 'VALID' : insuranceStatusFromProvider || 'NOT_AVAILABLE';
  const pucStatus = pucValidUntil ? getProviderDateStatus(pucValidUntil, now) : pucStatusFromProvider === 'LIFETIME' ? 'VALID' : pucStatusFromProvider || 'NOT_AVAILABLE';
  const financed = providerBoolean(firstProviderValue(
    data.financed,
    data.isFinanced,
    data.is_financed,
    data.hirePurchase,
    data.hire_purchase,
    data.hirePurchaseStatus,
    data.hire_purchase_status,
    data.hypothecated,
    data.hypothecationStatus,
    data.hypothecation_status,
    data.loanStatus,
    data.loan_status,
  ));
  const financerName = firstText(
    data.financer,
    data.financier,
    data.financerName,
    data.financer_name,
    data.financier_name,
    data.financeName,
    data.finance_name,
    data.financeCompany,
    data.finance_company,
    data.financierCompany,
    data.financier_company,
    data.hypothecation,
    data.hypothecatedTo,
    data.hypothecated_to,
  );
  const effectiveFinanced = financed ?? (financerName && !/^(none|n\/a|not[ -]?financed|not[ -]?applicable)$/i.test(financerName) ? true : undefined);
  const rawHsrp = firstText(data.hsrpNumber, data.hsrp_number, data.hsrpNo, data.hsrp_no, data.hsrpPlateNumber, data.hsrp_plate_number);
  const hsrpStatus = normalizeHsrpStatus(firstText(data.hsrpStatus, data.hsrp_status, data.hsrpValid, data.hsrp_valid, data.hsrpAvailable, data.hsrp_available, isHsrpStatusToken(data.hsrp) ? data.hsrp : ''));
  const hsrpNumber = rawHsrp && !isHsrpStatusToken(rawHsrp) ? rawHsrp : '';
  const effectiveHsrpStatus = hsrpStatus || (hsrpNumber ? 'YES' : 'PENDING');

  return {
    registrationNo,
    chassisOrSerialNo,
    ownerName,
    engineNumber,
    categoryName,
    brandName,
    model,
    variant,
    fuelType,
    ...(transmission ? { transmission } : {}),
    ...(grossPower ? { grossPower } : {}),
    manufacturingYear,
    registrationDate,
    registrationUpto,
    previousOwners,
    titleSuggestion: [brandName, model].filter(Boolean).join(' '),
    insuranceExpiry: insuranceStatus === 'VALID' ? insuranceExpiry : '',
    rtoDetails: {
      hirePurchaseStatus: effectiveFinanced === true ? 'ACTIVE' : effectiveFinanced === false ? 'NOT_APPLICABLE' : 'PENDING',
      financerName,
      taxStatus,
      taxValidUntil: taxStatus === 'VALID' ? taxValidUntil : '',
      fitnessStatus,
      fitnessValidUntil: fitnessStatus === 'VALID' ? fitnessValidUntil : '',
      insuranceStatus,
      pucStatus,
      pucValidUntil: pucStatus === 'VALID' ? pucValidUntil : '',
      hsrpNumber,
      ...(hsrpStatus || hsrpNumber ? { hsrpStatus: effectiveHsrpStatus } : {}),
      rtoOffice: firstText(data.registeredAt, data.registered_at, data.rtoOffice, data.rto_office, data.rtoName, data.rto_name),
    },
  };
};

export const mapProviderVehicleToListing = mapChassisToRcVehicle;

export const normalizeMasterName = (value: unknown) =>
  text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const findMasterOption = <T extends { id: string | number; name: string }>(options: T[], value: unknown) => {
  const normalized = normalizeMasterName(value);
  return normalized ? options.find((option) => normalizeMasterName(option.name) === normalized) : undefined;
};

export const getProviderVehicleIdentityMismatch = (
  source: VehicleVerificationSource,
  requestedRegistrationNumber: unknown,
  requestedChassisNumber: unknown,
  result: ProviderVehicleResult | VehicleVerificationAutofill,
) => {
  const returnedRegistration = normalizeRegistrationNumber(
    'registrationNo' in result ? result.registrationNo : result.rcNumber ?? result.rc_number,
  );
  const returnedChassis = normalizeChassis(
    'chassisOrSerialNo' in result ? result.chassisOrSerialNo : result.vehicleChasiNumber ?? result.vehicle_chasi_number,
  );
  const requestedRegistration = normalizeRegistrationNumber(requestedRegistrationNumber);
  const requestedChassis = normalizeChassis(requestedChassisNumber);

  if (source === 'RC_FULL' && requestedRegistration && returnedRegistration && requestedRegistration !== returnedRegistration) {
    return 'The verified vehicle number does not match the entered vehicle number.';
  }
  if (requestedChassis && returnedChassis && requestedChassis !== returnedChassis) {
    return 'The verified chassis number does not match the entered chassis number.';
  }
  if (source === 'CHASSIS' && requestedRegistration && returnedRegistration && requestedRegistration !== returnedRegistration) {
    return 'The verified vehicle number does not match the entered vehicle number.';
  }
  return null;
};
