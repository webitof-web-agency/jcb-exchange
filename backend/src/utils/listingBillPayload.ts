export type ListingBillType = 'NON_TAX' | 'TAX_INVOICE';

export type ListingBillPayload = {
  invoiceType: ListingBillType;
  invoiceNumber: string;
  invoiceDate: string;
  memberName: string;
  customerMobile: string;
  customerEmail: string;
  customerState: string;
  itemDescription: string;
  amount: number;
  customNotes: string;
  taxType: 'INTRA_STATE' | 'INTER_STATE';
  gstRate: number;
  invoiceSettings?: {
    companyName: string;
    gstin: string;
    address: string;
    state: string;
    city: string;
    termsAndConditions: string;
  };
  logoUrl?: string;
};

const asTrimmedString = (value: unknown, fallback = '') => String(value ?? fallback).trim();

export const normalizeListingBillPayload = (input: unknown): ListingBillPayload => {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const invoiceType = asTrimmedString(source.invoiceType).toUpperCase();

  if (invoiceType !== 'NON_TAX' && invoiceType !== 'TAX_INVOICE') {
    throw new Error('A valid invoice type is required.');
  }

  const amount = Number(source.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Bill amount must be a non-negative number.');
  }

  const gstRate = Number(source.gstRate ?? 18);
  if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) {
    throw new Error('GST rate must be between 0 and 100.');
  }

  const taxType = asTrimmedString(source.taxType, 'INTRA_STATE').toUpperCase();
  if (taxType !== 'INTRA_STATE' && taxType !== 'INTER_STATE') {
    throw new Error('A valid tax type is required.');
  }

  const rawSettings = source.invoiceSettings && typeof source.invoiceSettings === 'object'
    ? source.invoiceSettings as Record<string, unknown>
    : null;

  return {
    invoiceType,
    invoiceNumber: asTrimmedString(source.invoiceNumber),
    invoiceDate: asTrimmedString(source.invoiceDate),
    memberName: asTrimmedString(source.memberName, 'Customer'),
    customerMobile: asTrimmedString(source.customerMobile),
    customerEmail: asTrimmedString(source.customerEmail),
    customerState: asTrimmedString(source.customerState),
    itemDescription: asTrimmedString(source.itemDescription, 'Listing Payment'),
    amount: Number(amount.toFixed(2)),
    customNotes: asTrimmedString(source.customNotes),
    taxType,
    gstRate: Number(gstRate.toFixed(2)),
    ...(rawSettings ? {
      invoiceSettings: {
        companyName: asTrimmedString(rawSettings.companyName, 'JCB Exchange'),
        gstin: asTrimmedString(rawSettings.gstin),
        address: asTrimmedString(rawSettings.address),
        state: asTrimmedString(rawSettings.state),
        city: asTrimmedString(rawSettings.city),
        termsAndConditions: asTrimmedString(rawSettings.termsAndConditions),
      },
    } : {}),
    ...(asTrimmedString(source.logoUrl) ? { logoUrl: asTrimmedString(source.logoUrl) } : {}),
  };
};
