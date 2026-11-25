import { maskOfferLinks } from '../../utils/offerShortCode';

/**
 * Late binding of offer links for SMS. An offer link is a bearer secret, so a queued SMS keeps only which link
 * version it was written for (payload.offerLink) and masked copies of the link values; the real values are built
 * again just before the provider call. Pure helpers (no database): the service does the lookups.
 */

export type SmsOfferLinkRef = { offerId: string; tokenVersion: number };

export type SmsOfferLinkValues = { offerResponseUrl: string; offerShortUrl: string; offerShortCode: string };

/** Same shape as resolveOfferLinkForDelivery's result, declared here so this module stays free of the database. */
export type SmsOfferLinkResolution =
  | ({ open: true } & SmsOfferLinkValues)
  | { open: false; reason: 'OFFER_NOT_FOUND' | 'LINK_SUPERSEDED' | 'OFFER_NOT_OPEN' };

/** The link version a message was written for, or null when the message carries no offer link. */
export const readSmsOfferLinkRef = (payload: Record<string, unknown> | null | undefined): SmsOfferLinkRef | null => {
  const ref = payload?.offerLink;
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return null;
  const { offerId, tokenVersion } = ref as Record<string, unknown>;
  if (typeof offerId !== 'string' || !offerId.trim() || typeof tokenVersion !== 'number' || !Number.isInteger(tokenVersion)) return null;
  return { offerId, tokenVersion };
};

/**
 * What the outbox keeps. An offer message is stored masked (the link is filled in at delivery). Other messages are
 * stored unchanged: they hold no offer link, and their values (invoice / receipt links) are sent as stored.
 */
export const buildSmsOutboxSnapshot = (payload: Record<string, unknown>): Record<string, unknown> => {
  if (readSmsOfferLinkRef(payload)) return maskOfferLinks(payload);
  // Fail closed: offer link values without a valid offerLink are never stored in clear (delivery then has no link
  // to send and the template check fails visibly, instead of a stale link going out).
  const hasLinkValue = OFFER_LINK_FIELDS.some((key) => typeof payload[key] === 'string' && (payload[key] as string).trim());
  return hasLinkValue ? maskOfferLinks(payload) : payload;
};

const OFFER_LINK_FIELDS = ['offerResponseUrl', 'offerShortUrl', 'offerShortCode'] as const;

/** Error text safe to store: the exact link values sent are blanked first (a provider may echo the request). */
export const maskSentOfferLinkValues = (text: string, payload: Record<string, unknown> | null | undefined) => {
  let masked = text;
  for (const key of OFFER_LINK_FIELDS) {
    const value = payload?.[key];
    if (typeof value === 'string' && value.trim().length >= 4) masked = masked.split(value).join('****');
  }
  return maskOfferLinks(masked);
};

/** Message log text for a message that is not sent because its offer link is no longer valid. */
export const smsOfferLinkSkipReason = (reason: Extract<SmsOfferLinkResolution, { open: false }>['reason']) => {
  if (reason === 'LINK_SUPERSEDED') return 'Offer link superseded by a resend';
  if (reason === 'OFFER_NOT_OPEN') return 'Offer is no longer open';
  return 'Offer no longer exists';
};

/**
 * Delivery decision: send with the fresh link values, or cancel (a resend replaced the link, or the offer is no
 * longer waiting for an answer). A copy is returned; the stored snapshot is never changed.
 */
export const applySmsOfferLinkResolution = (
  payload: Record<string, unknown>,
  resolution: SmsOfferLinkResolution,
): { send: true; payload: Record<string, unknown> } | { send: false; reason: string } => {
  if (!resolution.open) return { send: false, reason: smsOfferLinkSkipReason(resolution.reason) };
  return {
    send: true,
    payload: {
      ...payload,
      offerResponseUrl: resolution.offerResponseUrl,
      offerShortUrl: resolution.offerShortUrl,
      offerShortCode: resolution.offerShortCode,
    },
  };
};
