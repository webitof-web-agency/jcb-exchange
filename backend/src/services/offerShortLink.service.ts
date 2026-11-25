import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { buildOfferShortUrl, generateOfferShortCode, isOfferShortCode } from '../utils/offerShortCode';
import { buildOfferResponseUrl, createOfferResponseToken, offerLinkExpiryTimestamp, resolveOfferResponseOrigin } from '../utils/offerResponseToken';

/**
 * One short link per offer link version. Resending an offer increments responseTokenVersion, so the old short link
 * (and the old long link) stop working and a new one is made. The short link stores no token: the signed token is
 * built again from (offerId, version, expiresAt) whenever it is needed, so nothing secret sits in the message logs.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export const ensureOfferShortLink = async (offerId: string, tokenVersion: number, db: Db = prisma) => {
  const existing = await db.offerShortLink.findUnique({ where: { offerId_tokenVersion: { offerId, tokenVersion } } });
  if (existing) return existing;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await db.offerShortLink.create({
        data: { code: generateOfferShortCode(), offerId, tokenVersion, expiresAt: new Date(offerLinkExpiryTimestamp() * 1000) },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      // Another request made the link for this version, or (very rarely) the random code was taken: read / retry.
      const made = await db.offerShortLink.findUnique({ where: { offerId_tokenVersion: { offerId, tokenVersion } } });
      if (made) return made;
    }
  }
  throw new Error('A short link could not be created for this offer.');
};

/** The long (signed token) and short links of one link version, with the same expiry. */
export const offerLinksFor = (link: { offerId: string; tokenVersion: number; code: string; expiresAt: Date }) => {
  const token = createOfferResponseToken(link.offerId, link.tokenVersion, Math.floor(link.expiresAt.getTime() / 1000));
  return {
    offerResponseUrl: buildOfferResponseUrl(token),
    offerResponsePath: `/offer-response/${encodeURIComponent(token)}`,
    offerShortUrl: buildOfferShortUrl(resolveOfferResponseOrigin(), link.code),
    offerShortCode: link.code,
  };
};

export type OfferLinkForDelivery =
  | { open: true; offerResponseUrl: string; offerShortUrl: string; offerShortCode: string }
  | { open: false; reason: 'OFFER_NOT_FOUND' | 'LINK_SUPERSEDED' | 'OFFER_NOT_OPEN' };

/**
 * Fresh link values for a message that is about to be delivered (late binding). A message written for an older link
 * version (the offer was resent since) is never delivered, and by default neither is an invitation to sign an offer
 * that is no longer waiting for an answer.
 */
export const resolveOfferLinkForDelivery = async (
  offerId: string,
  tokenVersion: number,
  options: { requireOpenOffer?: boolean } = {},
): Promise<OfferLinkForDelivery> => {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { id: true, status: true, responseTokenVersion: true } });
  if (!offer) return { open: false, reason: 'OFFER_NOT_FOUND' };
  if (offer.responseTokenVersion !== tokenVersion) return { open: false, reason: 'LINK_SUPERSEDED' };
  if ((options.requireOpenOffer ?? true) && offer.status !== 'SENT') return { open: false, reason: 'OFFER_NOT_OPEN' };
  const link = await ensureOfferShortLink(offerId, tokenVersion);
  const { offerResponseUrl, offerShortUrl, offerShortCode } = offerLinksFor(link);
  return { open: true, offerResponseUrl, offerShortUrl, offerShortCode };
};

export type ShortLinkLookup =
  | { status: 'OPEN'; path: string }
  | { status: 'CLOSED' }
  | { status: 'NOT_FOUND' };

/**
 * /o/<code>: the current link version opens the offer page (which itself shows accepted / declined / expired /
 * withdrawn); a link from before a resend is closed, as the long link is.
 */
export const lookupOfferShortLink = async (code: string): Promise<ShortLinkLookup> => {
  if (!isOfferShortCode(code)) return { status: 'NOT_FOUND' };
  const link = await prisma.offerShortLink.findUnique({ where: { code }, include: { offer: { select: { responseTokenVersion: true } } } });
  if (!link) return { status: 'NOT_FOUND' };
  if (link.offer.responseTokenVersion !== link.tokenVersion || link.expiresAt.getTime() <= Date.now()) return { status: 'CLOSED' };
  await prisma.offerShortLink.update({ where: { id: link.id }, data: { openCount: { increment: 1 }, lastOpenedAt: new Date() } }).catch(() => undefined);
  return { status: 'OPEN', path: offerLinksFor(link).offerResponsePath };
};
