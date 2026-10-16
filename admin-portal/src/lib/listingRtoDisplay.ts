export type ListingRtoOptionalTextFields = {
  financerName?: string | null;
  hsrpNumber?: string | null;
};

export const getListingRtoOptionalTextFields = (record: ListingRtoOptionalTextFields) => (
  [
    record.financerName?.trim() ? ['Financer Name', record.financerName.trim()] : null,
    record.hsrpNumber?.trim() ? ['HSRP Number', record.hsrpNumber.trim()] : null,
  ] as ([string, string] | null)[]
).filter((field): field is [string, string] => field !== null);
