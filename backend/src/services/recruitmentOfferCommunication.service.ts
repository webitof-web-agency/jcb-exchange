import { buildOfferResponseUrl, createOfferResponseToken, offerLinkExpiryTimestamp } from '../utils/offerResponseToken';
import { buildOfferShortUrl } from '../utils/offerShortCode';
import { offerValidUntilDay } from '../utils/offerRules';
import { resolveOfferResponseOrigin } from '../utils/offerResponseToken';
import { dispatchRecruitmentSms } from './smsIntegration.service';
import { dispatchRecruitmentWhatsApp } from './whatsappIntegration.service';
import { enqueueOfferEmail } from './recruitmentEmail.service';
import { ensureOfferShortLink } from './offerShortLink.service';

export type OfferCommunicationSource = {
  id: string;
  responseTokenVersion: number;
  offerValidUntil: Date | null;
  joiningDate?: Date | null;
  /** The letter data: its offerValidUntil is the fallback when the column is empty (the public page does the same). */
  offerLetterData?: unknown;
  offerLetterUrl: string | null;
  offerLetterFileName: string | null;
  designation: string;
  candidate: { fullName: string; mobile?: string | null; email?: string | null };
  application: { id: string; applicationRef: string };
  job: { title: string };
};

export const OFFER_CHANNELS = ['email', 'whatsapp', 'sms'] as const;
export type OfferChannel = (typeof OFFER_CHANNELS)[number];

/** The channels named in a request body (unknown names ignored); undefined = all of them. */
export const parseOfferChannels = (value: unknown): OfferChannel[] | undefined => {
  if (value === undefined || value === null) return undefined;
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const chosen = OFFER_CHANNELS.filter((channel) => list.some((item) => String(item).trim().toLowerCase() === channel));
  return chosen;
};

export type OfferCommunicationPayload = {
  candidateName: string;
  applicationId: string;
  applicationRef: string;
  jobTitle: string;
  designation: string;
  offerLetterUrl: string;
  offerLetterFileName: string;
  /** Long signed link. Channels must not store it in clear: they rebuild it at delivery from offerLink. */
  offerResponseUrl: string;
  /** https://<site>/o/<code> ('' when no short link could be made). */
  offerShortUrl: string;
  /** The 8-character code alone: a WhatsApp URL-button suffix or a DLT variable after a fixed URL in the template. */
  offerShortCode: string;
  /** YYYY-MM-DD ('' when not set): shown as "reply before" (informational; HR expires an offer by hand). */
  offerValidUntil: string;
  joiningDate: string;
  /** Which link version this message is for: delivery re-checks it so a resent offer never gets an old link. */
  offerLink: { offerId: string; tokenVersion: number };
};

const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : '');

/** Builds the message values; `link` is the short link of this version (from ensureOfferShortLink). */
export const buildOfferCommunicationPayload = (
  offer: OfferCommunicationSource,
  link?: { code: string; expiresAt: Date } | null,
): OfferCommunicationPayload => {
  if (!offer.offerLetterUrl) throw new Error('The offer letter PDF is unavailable.');
  const expiresAt = link ? Math.floor(link.expiresAt.getTime() / 1000) : offerLinkExpiryTimestamp();
  const token = createOfferResponseToken(offer.id, offer.responseTokenVersion, expiresAt);
  return {
    candidateName: offer.candidate.fullName,
    applicationId: offer.application.id,
    applicationRef: offer.application.applicationRef,
    jobTitle: offer.job.title,
    designation: offer.designation,
    offerLetterUrl: offer.offerLetterUrl,
    offerLetterFileName: offer.offerLetterFileName || 'Offer_Letter.pdf',
    offerResponseUrl: buildOfferResponseUrl(token),
    offerShortUrl: link ? buildOfferShortUrl(resolveOfferResponseOrigin(), link.code) : '',
    offerShortCode: link?.code ?? '',
    offerValidUntil: offerValidUntilDay(offer.offerValidUntil, offer.offerLetterData),
    joiningDate: day(offer.joiningDate),
    offerLink: { offerId: offer.id, tokenVersion: offer.responseTokenVersion },
  };
};

export type ChannelResult = {
  channel: OfferChannel;
  ok: boolean;
  /** Not chosen for this send (resend with a channel choice). */
  skipped?: boolean;
  reason?: string;
  result?: unknown;
  error?: string;
};

const runChannel = async (channel: OfferChannel, work: () => Promise<unknown>): Promise<ChannelResult> => {
  try {
    const result = await work();
    if (typeof result !== 'object' || result === null) return { channel, ok: true, result };
    const outcome = result as { queued?: unknown; sent?: unknown; error?: unknown; reason?: unknown };
    // Queued but rejected right away by the provider (sent === false) is a failure, not a success.
    const ok = 'queued' in outcome ? Boolean(outcome.queued) && outcome.sent !== false : true;
    return {
      channel, ok, result,
      ...(typeof outcome.reason === 'string' ? { reason: outcome.reason } : {}),
      ...(!ok && typeof outcome.error === 'string' ? { error: outcome.error } : {}),
    };
  } catch (error) {
    return { channel, ok: false, error: error instanceof Error ? error.message : 'Channel dispatch failed.' };
  }
};

/**
 * Dispatches each offer channel independently. A provider/configuration failure is reported for that channel and
 * never rolls back the saved offer or blocks the other channels. `channels` limits a resend to the chosen channels.
 */
export const dispatchOfferCommunications = async (
  offer: OfferCommunicationSource,
  dedupeSuffix?: string,
  options: { channels?: readonly OfferChannel[] | undefined } = {},
) => {
  const wanted = new Set<OfferChannel>(options.channels ?? OFFER_CHANNELS);
  const notChosen = (channel: OfferChannel): ChannelResult => ({ channel, ok: false, skipped: true, reason: 'NOT_SELECTED' });
  let payload: OfferCommunicationPayload;
  try {
    // The short link of this version (same expiry as the long link). Without it the long link still goes out.
    const link = await ensureOfferShortLink(offer.id, offer.responseTokenVersion).catch((error) => {
      console.error('[offer] short link could not be created:', error instanceof Error ? error.message : error);
      return null;
    });
    payload = buildOfferCommunicationPayload(offer, link);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Offer communication payload is invalid.';
    const failed = (channel: OfferChannel): ChannelResult => (wanted.has(channel) ? { channel, ok: false, error: message } : notChosen(channel));
    return { email: failed('email'), whatsapp: failed('whatsapp'), sms: failed('sms'), allSucceeded: false };
  }
  const common = {
    relatedEntityType: 'OFFER',
    relatedEntityId: offer.id,
    recipientType: 'CANDIDATE' as const,
    payloadSnapshot: payload,
    ...(offer.candidate.mobile === undefined ? {} : { recipientPhone: offer.candidate.mobile }),
    ...(dedupeSuffix ? { dedupeSuffix } : {}),
  };
  const [email, whatsapp, sms] = await Promise.all([
    wanted.has('email') ? runChannel('email', () => enqueueOfferEmail(offer.id)) : Promise.resolve(notChosen('email')),
    wanted.has('whatsapp') ? runChannel('whatsapp', () => dispatchRecruitmentWhatsApp({ ...common, eventCode: 'RECRUITMENT_OFFER_SENT', dispatchSms: false })) : Promise.resolve(notChosen('whatsapp')),
    wanted.has('sms') ? runChannel('sms', () => dispatchRecruitmentSms({ ...common, eventCode: 'RECRUITMENT_OFFER_SENT' })) : Promise.resolve(notChosen('sms')),
  ]);
  const chosen = [email, whatsapp, sms].filter((channel) => !channel.skipped);
  return {
    email,
    whatsapp,
    sms,
    allSucceeded: chosen.length > 0 && chosen.every((channel) => channel.ok),
  };
};
