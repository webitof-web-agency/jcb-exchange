const text = (value) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};
const nameOf = (value) => text(value) || text(value?.name) || text(value?.label);

const modelFromListingTitle = (listing, brandName) => {
  const title = text(listing.title) || text(listing.vehicleName);
  if (!title) return '';

  const manufacturingYear = text(listing.manufacturingYear);
  let model = title;
  if (brandName) {
    model = model.replace(new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i'), '').trim();
  }
  if (manufacturingYear) {
    model = model.replace(new RegExp(`\\s*${manufacturingYear}\\s*$`), '').trim();
  }
  return model || title;
};

const resolveVehicleModel = (listing, brandName) => {
  const candidate = nameOf(listing.model) || text(listing.vehicleModel);
  const manufacturingYear = text(listing.manufacturingYear);
  const isYearOnlyModel = Boolean(candidate && /^\d{4}$/.test(candidate) && (!manufacturingYear || candidate === manufacturingYear));
  return isYearOnlyModel ? modelFromListingTitle(listing, brandName) : candidate || modelFromListingTitle(listing, brandName);
};

const hasLinkedListing = (records, listingId) => {
  const normalizedListingId = text(listingId);
  return Array.isArray(records) && Boolean(normalizedListingId) && records.some((record) => text(record?.listingId) === normalizedListingId);
};

const normalizeListingState = (value) => {
  const state = text(value);
  return state && state.toLowerCase() !== 'not specified' ? state : '';
};

export const isInternalAccountLinkRole = (role) => ['SUPER_ADMIN', 'EMPLOYEE'].includes(role);

export const buildAccountModuleUrl = (pathname, module, listingId) => {
  const portal = pathname.startsWith('/employee')
    ? 'employee'
    : pathname.startsWith('/admin')
      ? 'admin'
      : 'superadmin';
  const params = new URLSearchParams();
  if (listingId) params.set('listingId', listingId);
  return `/` + portal + `/accounts/` + module + (params.toString() ? `?${params.toString()}` : '');
};

export const getListingAccountPrefill = (listing = {}) => {
  const linkedRto = Array.isArray(listing.rtoRecords) ? listing.rtoRecords[0] : null;
  const brandName = nameOf(listing.brand) || nameOf(listing.brandName);
  return {
    listingId: text(listing.id),
    listingTitle: text(listing.title) || text(listing.vehicleName) || 'Listing',
    ownerName: text(listing.ownerName),
    // Keep the vehicle owner's contact separate from the listing publisher's contact.
    // `dealerPhone` is the Listed By/partner number, not the vehicle owner's number.
    ownerNumber: text(listing.ownerNumber),
    vehicleNumber: text(linkedRto?.vehicleNumber) || text(listing.registrationNumber) || text(listing.vehicleNumber),
    chassisNumber: text(listing.chassisNumber),
    vehicleType: nameOf(listing.category) || nameOf(listing.vehicleType),
    brandName,
    vehicleModel: resolveVehicleModel(listing, brandName),
    sellerName: text(listing.dealer),
    sellerNumber: text(listing.sellerNumber) || text(listing.dealerPhone),
    sellerState: normalizeListingState(listing.locationState),
  };
};

export const mergeListingAccountPrefill = (record = {}, prefill = {}) => {
  const merged = { ...record };
  const copyIfMissing = (key) => {
    if (!text(merged[key]) && text(prefill[key])) merged[key] = prefill[key];
  };

  ['listingId', 'vehicleNumber', 'chassisNumber', 'vehicleType', 'brandName', 'ownerName', 'ownerNumber', 'sellerName', 'sellerNumber']
    .forEach(copyIfMissing);

  const currentModel = text(merged.vehicleModel);
  const prefetchedModel = text(prefill.vehicleModel);
  if (!currentModel || (/^\d{4}$/.test(currentModel) && prefetchedModel && currentModel !== prefetchedModel)) {
    merged.vehicleModel = prefill.vehicleModel;
  }

  if (!text(merged.listingTitle) && text(prefill.listingTitle)) merged.listingTitle = prefill.listingTitle;
  return merged;
};

/**
 * @param {string | number | null | undefined} listingId
 * @param {{ rtoRecords?: Array<{ listingId?: string | null }>, sellRecords?: Array<{ listingId?: string | null }> }} options
 */
export const getListingAccountLinkState = (listingId, { rtoRecords = [], sellRecords = [] } = {}) => ({
  rtoExists: hasLinkedListing(rtoRecords, listingId),
  sellExists: hasLinkedListing(sellRecords, listingId),
});
