// Shared types and labels for purchase bills, other sales invoices and credit/debit notes.

export const DOCUMENT_TYPES = ['PURCHASE_BILL', 'SALES_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';
export const NOTE_REASONS = ['RETURN', 'PRICE_CHANGE', 'DISCOUNT', 'DEFICIENCY', 'OTHER'] as const;
export type NoteReason = (typeof NOTE_REASONS)[number];

export const documentLabel: Record<DocumentType, string> = {
  PURCHASE_BILL: 'Purchase bill',
  SALES_INVOICE: 'Sales invoice',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
};

export const reasonLabel: Record<NoteReason, string> = {
  RETURN: 'Goods returned',
  PRICE_CHANGE: 'Price revised',
  DISCOUNT: 'Discount after sale',
  DEFICIENCY: 'Deficiency in service',
  OTHER: 'Other',
};

export const documentStatusTone = { DRAFT: 'slate', POSTED: 'green', CANCELLED: 'red' } as const;

/** Purchase side documents are against suppliers (and manage permission is fh.purchases.manage). */
export const isPurchaseSide = (type: DocumentType) => type === 'PURCHASE_BILL' || type === 'DEBIT_NOTE';
export const managePermission = (type: DocumentType) => (isPurchaseSide(type) ? 'fh.purchases.manage' : 'fh.sales.manage');
/** A credit note corrects a sales invoice; a debit note corrects a purchase bill. */
export const originalTypeFor = (type: DocumentType): DocumentType | null => (type === 'CREDIT_NOTE' ? 'SALES_INVOICE' : type === 'DEBIT_NOTE' ? 'PURCHASE_BILL' : null);

export type DocumentLine = {
  id?: string; lineNo?: number; description: string; accountId: string; hsnSac: string | null; quantity: number; rate: number; discount: number;
  taxableValue?: number; gstRate: number; cgst?: number; sgst?: number; igst?: number; itcEligible: boolean; sellAccountId: string | null; costCentreId: string | null;
};

export type FinDocument = {
  id: string; docType: DocumentType; status: DocumentStatus; number: string | null; partyDocNumber: string | null; date: string; dueDate: string | null;
  partyId: string; party: { id: string; code: string; name: string; gstin?: string | null; stateCode?: string | null };
  placeOfSupply: string | null; isIntraState: boolean; isReverseCharge: boolean; reason: NoteReason | null; againstDocumentId: string | null; againstReference: string | null;
  sellAccountId: string | null; notes: string | null; subTotal: number; cgst: number; sgst: number; igst: number; tdsSection: string | null; tdsAmount: number;
  roundOff: number; total: number; voucherId: string | null; cancelReason: string | null; lines: DocumentLine[];
  voucher?: { id: string; number: string | null; status: string; reversal: { id: string; number: string | null } | null } | null;
  against?: { id: string; number: string | null; date: string; total: number } | null;
};

export const GST_STATES: Array<[string, string]> = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'],
  ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'],
  ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'],
  ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory'],
];
export const stateName = (code: string | null | undefined) => GST_STATES.find(([value]) => value === code)?.[1] ?? null;
