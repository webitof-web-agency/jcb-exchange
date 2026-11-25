/**
 * Late binding of offer links in WhatsApp messages. The offer link (long signed link, short link and its code) is a
 * bearer secret and changes when HR resends the offer, so an outbox row never stores it: the message is written with
 * placeholders and the real values are filled in just before Meta is called, after the host checked that the link
 * version is still the current one. No database here: unit-tested.
 */

export const OFFER_LINK_FIELDS = ['offerResponseUrl', 'offerShortUrl', 'offerShortCode'] as const;
export type OfferLinkField = (typeof OFFER_LINK_FIELDS)[number];
export type OfferLinkValues = Record<OfferLinkField, string>;

// Square brackets: never a Meta {{n}} placeholder and never part of a real link or code.
export const OFFER_LINK_PLACEHOLDERS: Readonly<OfferLinkValues> = {
  offerResponseUrl: '[[offerResponseUrl]]',
  offerShortUrl: '[[offerShortUrl]]',
  offerShortCode: '[[offerShortCode]]',
};

export type OfferLinkRef = { offerId: string; tokenVersion: number };

/** payload.offerLink = { offerId, tokenVersion } when the message carries an offer link; null otherwise. */
export const readOfferLinkRef = (payload: unknown): OfferLinkRef | null => {
  if (!payload || typeof payload !== 'object') return null;
  const link = (payload as { offerLink?: unknown }).offerLink;
  if (!link || typeof link !== 'object') return null;
  const { offerId, tokenVersion } = link as { offerId?: unknown; tokenVersion?: unknown };
  if (typeof offerId !== 'string' || !offerId.trim()) return null;
  if (typeof tokenVersion !== 'number' || !Number.isInteger(tokenVersion) || tokenVersion < 0) return null;
  return { offerId, tokenVersion };
};

/**
 * The payload to build the stored message from: every link field is a placeholder. All three are set even when the
 * dispatch-time value was empty (short link not made yet), because delivery always has all three.
 */
export const withOfferLinkPlaceholders = <T extends Record<string, unknown>>(payload: T): T & OfferLinkValues => ({
  ...payload,
  ...OFFER_LINK_PLACEHOLDERS,
});

const replacePlaceholders = (text: string, values: OfferLinkValues) => OFFER_LINK_FIELDS.reduce(
  (current, field) => current.split(OFFER_LINK_PLACEHOLDERS[field]).join(values[field]),
  text,
);

/** A copy of the stored components with the placeholders replaced by the current link values. */
export const fillOfferLinkPlaceholders = <T>(value: T, values: OfferLinkValues, depth = 0): T => {
  if (depth > 8) return value;
  if (typeof value === 'string') return replacePlaceholders(value, values) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => fillOfferLinkPlaceholders(item, values, depth + 1)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, fillOfferLinkPlaceholders(item, values, depth + 1)])) as T;
  }
  return value;
};

/** True when something still holds a placeholder: such a message must never reach Meta unfilled. */
export const hasOfferLinkPlaceholders = (value: unknown): boolean => {
  const text = JSON.stringify(value ?? null);
  return OFFER_LINK_FIELDS.some((field) => text.includes(OFFER_LINK_PLACEHOLDERS[field]));
};

export type OfferLinkClosedReason = 'OFFER_NOT_FOUND' | 'LINK_SUPERSEDED' | 'OFFER_NOT_OPEN';

/** Short text stored on the skipped log and the cancelled outbox row. */
export const offerLinkSkipMessage = (reason: OfferLinkClosedReason) =>
  reason === 'LINK_SUPERSEDED' ? 'Offer link superseded by a resend' : 'Offer is no longer open';
