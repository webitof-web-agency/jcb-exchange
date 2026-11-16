import { z } from 'zod';

const blankToUndefined = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return value;
};
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const optionalShortText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().min(2).max(max).optional());
const optionalNumber = z.preprocess(blankToUndefined, z.coerce.number().finite().optional());
const optionalNonNegativeNumber = z.preprocess(blankToUndefined, z.coerce.number().finite().min(0).optional());

/**
 * The person receiving a private completion URL may complete only this listing's
 * allowlisted vehicle form. Finance, CRM, users, and other resources are not in
 * this contract. Media is uploaded through the separate slot endpoint.
 */
export const listingCompletionOwnerPayloadSchema = z.object({
  title: optionalShortText(180),
  ownerName: optionalText(120),
  price: optionalNumber.refine((value) => value === undefined || value > 0, 'Price must be greater than 0.'),
  manufacturingYear: optionalNumber.refine((value) => value === undefined || (Number.isInteger(value) && value >= 1950 && value <= new Date().getFullYear() + 1), 'Enter a valid manufacturing year.'),
  locationState: optionalShortText(100),
  locationCity: optionalShortText(100),
  address: optionalShortText(500),
  condition: optionalText(80),
  variant: optionalText(160),
  registrationDate: optionalText(40),
  registrationUpto: optionalText(40),
  previousOwners: optionalText(40),
  fuelType: optionalText(80),
  transmission: optionalText(80),
  pinCode: optionalText(20),
  nearbyLandmark: optionalText(180),
  description: optionalText(5000),
  additionalDescription: optionalText(5000),
  grossPower: optionalText(80),
  engineNumber: optionalText(100),
  registrationNo: optionalText(100),
  chassisOrSerialNo: optionalText(100),
  operatingHours: optionalNonNegativeNumber.refine((value) => value === undefined || Number.isInteger(value), 'Operating hours must be a whole number.'),
  isNegotiable: z.boolean().optional(),
  rtoDetails: z.object({
    registrationNo: optionalText(100),
    vehicleType: optionalText(120),
    vehicleModel: optionalText(180),
    operatingHours: optionalNonNegativeNumber.refine((value) => value === undefined || Number.isInteger(value), 'Operating hours must be a whole number.'),
    hirePurchaseStatus: optionalText(40),
    financerName: optionalText(160),
    taxStatus: optionalText(40),
    taxValidUntil: optionalText(40),
    fitnessStatus: optionalText(40),
    fitnessValidUntil: optionalText(40),
    insuranceStatus: optionalText(40),
    insuranceValidUntil: optionalText(40),
    pucStatus: optionalText(40),
    pucValidUntil: optionalText(40),
    hsrpStatus: optionalText(40),
    hsrpNumber: optionalText(100),
    rtoOffice: optionalText(180),
    rtoAgentName: optionalText(160),
    rtoExpenses: optionalNonNegativeNumber,
    vehicleMaintenanceCost: optionalNonNegativeNumber,
  }).strict().optional(),
}).strict();

export type ListingCompletionOwnerPayload = z.infer<typeof listingCompletionOwnerPayloadSchema>;
