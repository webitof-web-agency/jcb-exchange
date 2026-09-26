export type BillingLocationInput = {
  city?: unknown;
  state?: unknown;
};

export type BillingLocation = {
  city: string;
  state: string;
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export const normalizeBillingLocation = (input: BillingLocationInput): BillingLocation => {
  const city = normalizeText(input.city);
  const state = normalizeText(input.state);

  if (!state) {
    throw new Error('Billing state is required before payment.');
  }

  if (!city) {
    throw new Error('Billing city is required before payment.');
  }

  return { city, state };
};
