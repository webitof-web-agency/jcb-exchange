/**
 * Resolves the consignor / consignee block of a transport record.
 * Name, city and state always come from the live Sold Vehicle record, so a correction made there
 * flows through to the tracking page and the challan PDF. Address, pincode and GSTIN are the only
 * values entered on the transport record itself.
 */

export type TransportPartyInput = {
  dispatchName?: string | null;
  dispatchGstin?: string | null;
  dispatchAddress?: string | null;
  dispatchCity?: string | null;
  dispatchState?: string | null;
  dispatchPincode?: string | null;
  deliveryName?: string | null;
  deliveryGstin?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryPincode?: string | null;
  declaredValue?: unknown;
};

export type TransportSellInput = {
  sellerName?: string | null;
  sellerCity?: string | null;
  sellerState?: string | null;
  purchaserName?: string | null;
  purchaserCity?: string | null;
  purchaserState?: string | null;
  sellAmount?: unknown;
};

export type TransportParty = {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

export type TransportParties = {
  dispatch: TransportParty;
  delivery: TransportParty;
  declaredValue: number;
};

const clean = (value?: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();

const squash = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Old records stored "City, State" in the address column. That is not a street address,
 * so it is dropped instead of being printed twice.
 */
export const meaningfulAddress = (address: string, places: Array<{ city: string; state: string }>): string => {
  const value = clean(address);
  if (!value) return '';
  const key = squash(value);
  for (const { city, state } of places) {
    const redundant = [squash(city), squash(state), squash(`${city}${state}`)].filter(Boolean);
    if (redundant.includes(key)) return '';
  }
  return value;
};

const toNumber = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(String(value));
  return Number.isFinite(num) ? num : 0;
};

export const resolveTransportParties = (
  record: TransportPartyInput,
  sell: TransportSellInput | null | undefined,
): TransportParties => {
  const dispatchCity = clean(sell?.sellerCity) || clean(record.dispatchCity);
  const dispatchState = clean(sell?.sellerState) || clean(record.dispatchState);
  const deliveryCity = clean(sell?.purchaserCity) || clean(record.deliveryCity);
  const deliveryState = clean(sell?.purchaserState) || clean(record.deliveryState);

  return {
    dispatch: {
      name: clean(sell?.sellerName) || clean(record.dispatchName),
      gstin: clean(record.dispatchGstin),
      address: meaningfulAddress(clean(record.dispatchAddress), [
        { city: dispatchCity, state: dispatchState },
        { city: clean(record.dispatchCity), state: clean(record.dispatchState) },
      ]),
      city: dispatchCity,
      state: dispatchState,
      pincode: clean(record.dispatchPincode),
    },
    delivery: {
      name: clean(sell?.purchaserName) || clean(record.deliveryName),
      gstin: clean(record.deliveryGstin),
      address: meaningfulAddress(clean(record.deliveryAddress), [
        { city: deliveryCity, state: deliveryState },
        { city: clean(record.deliveryCity), state: clean(record.deliveryState) },
      ]),
      city: deliveryCity,
      state: deliveryState,
      pincode: clean(record.deliveryPincode),
    },
    declaredValue: toNumber(sell?.sellAmount) || toNumber(record.declaredValue),
  };
};
