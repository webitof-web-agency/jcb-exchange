'use client';

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import HrmModal from '@/components/hrm/HrmModal';
import OfferAcceptanceDialog from './OfferAcceptanceDialog';
import {
  OFFER_CHANNELS,
  OFFER_CHANNEL_LABELS,
  OFFER_STATUS_ACTION_LABELS,
  allowedOfferStatusChanges,
  apiErrorMessage,
  chosenOfferChannels,
  describeOfferChannelReason,
  describeOfferDispatch,
  describeOfferStatusAction,
  offerHrmApi,
  statusChangeNeedsReason,
  type OfferChannel,
  type OfferDispatchSummary,
  type OfferStatus,
} from '@/lib/offerHrm';

/**
 * HR's manual status changes for one offer: resend, record accepted / declined, mark expired, withdraw. Only the moves
 * the server allows are offered (lib/offerHrm allowedOfferStatusChanges). Nothing expires by itself; HR does it here.
 * A (re)send goes out on the channels HR ticks and then shows what each channel did.
 */

const ACTION_STYLES: Partial<Record<OfferStatus, string>> = {
  SENT: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  DECLINED: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
  EXPIRED: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  WITHDRAWN: 'bg-orange-50 text-orange-700 hover:bg-orange-100',
};

const ALL_CHANNELS: Record<OfferChannel, boolean> = { email: true, whatsapp: true, sms: true };

const channelLine = (dispatch: OfferDispatchSummary, channel: OfferChannel): { text: string; className: string } => {
  if (dispatch.sent.includes(channel)) return { text: 'Sent', className: 'text-emerald-700' };
  if (dispatch.skipped.includes(channel)) return { text: 'Not chosen', className: 'text-gray-500' };
  const notSetUp = dispatch.notConfigured.find((item) => item.channel === channel);
  if (notSetUp) return { text: describeOfferChannelReason(channel, notSetUp.reason), className: 'text-amber-700' };
  const failure = dispatch.failed.find((item) => item.channel === channel);
  return { text: `Failed: ${failure?.error ?? 'it could not be sent.'}`, className: 'text-rose-700' };
};

export default function OfferStatusActions({
  offerId,
  status,
  candidateName,
  canChangeStatus,
  onChanged,
  compact = false,
  defaultPlace,
}: {
  offerId: string;
  status: OfferStatus;
  candidateName: string;
  canChangeStatus: boolean;
  onChanged: (status: OfferStatus) => void | Promise<void>;
  compact?: boolean;
  /** Pre-fills the place in "Record signed acceptance". */
  defaultPlace?: string | null;
}) {
  const [pending, setPending] = useState<OfferStatus | null>(null);
  const [reason, setReason] = useState('');
  const [channels, setChannels] = useState<Record<OfferChannel, boolean>>(ALL_CHANNELS);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** What each channel did after a (re)send; the list behind is refreshed when HR closes it. */
  const [dispatch, setDispatch] = useState<OfferDispatchSummary | null>(null);

  const actions = canChangeStatus ? allowedOfferStatusChanges(status) : [];
  if (!actions.length && !dispatch) return null;

  const chosen = chosenOfferChannels(channels);

  const open = (action: OfferStatus) => {
    setPending(action);
    setReason('');
    setChannels(ALL_CHANNELS);
    setError('');
    setDispatch(null);
  };

  const close = () => {
    if (saving) return;
    const resent = Boolean(dispatch);
    setPending(null);
    setReason('');
    setError('');
    setDispatch(null);
    if (resent) void onChanged('SENT');
  };

  const submit = async () => {
    if (!pending || saving) return;
    const needsReason = statusChangeNeedsReason(pending);
    if (needsReason && reason.trim().length < 3) {
      setError('Give a reason of at least 3 characters.');
      return;
    }
    if (pending === 'SENT' && !chosen.length) {
      setError('Choose at least one channel: Email, WhatsApp or SMS.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (pending === 'SENT') {
        const response = await offerHrmApi.resend(offerId, chosen);
        // The offer is sent: from here on only the per-channel result is shown (never an error for a saved send).
        setDispatch(describeOfferDispatch(response.data?.communications));
        return;
      }
      await offerHrmApi.changeStatus(offerId, pending, reason.trim() || undefined);
      toast.success(`Offer marked ${pending.toLowerCase()}.`);
      const done = pending;
      setPending(null);
      setReason('');
      await onChanged(done);
    } catch (reasonError) {
      setError(apiErrorMessage(reasonError, pending === 'SENT' ? 'The offer could not be sent. Try again.' : 'Could not change the offer status. Try again.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (channel: OfferChannel, checked: boolean) => {
    setChannels((current) => ({ ...current, [channel]: checked }));
    setError('');
  };

  return (
    <>
      {actions.length ? (
        <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'justify-end'}`}>
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => open(action)}
              className={`rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition ${ACTION_STYLES[action] ?? 'bg-gray-100 text-gray-700'}`}
            >
              {OFFER_STATUS_ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      ) : null}
      {pending === 'ACCEPTED' && (
        // An acceptance always carries evidence: HR uploads the signed copy (the candidate signs online themselves).
        <OfferAcceptanceDialog
          offerId={offerId}
          candidateName={candidateName}
          defaultPlace={defaultPlace ?? null}
          onClose={() => setPending(null)}
          onDone={async () => { setPending(null); await onChanged('ACCEPTED'); }}
        />
      )}
      {pending === 'SENT' && dispatch ? (
        <HrmModal
          title={dispatch.sent.length ? 'New link sent' : 'New link created'}
          description={`The previous link to ${candidateName || 'the candidate'} no longer works.`}
          onClose={close}
          size="sm"
          footer={(
            <div className="flex justify-end">
              <button type="button" onClick={close} className="rounded-xl bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-black hover:bg-[#e5ad06]">Done</button>
            </div>
          )}
        >
          <p
            role="status"
            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${dispatch.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
          >
            {dispatch.summary}
          </p>
          <ul className="mt-3 space-y-1.5 text-xs">
            {OFFER_CHANNELS.map((channel) => {
              const line = channelLine(dispatch, channel);
              return (
                <li key={channel} className="flex gap-2">
                  <span className="w-20 shrink-0 font-bold text-gray-900">{OFFER_CHANNEL_LABELS[channel]}</span>
                  <span className={line.className}>{line.text}</span>
                </li>
              );
            })}
          </ul>
        </HrmModal>
      ) : null}
      {pending && pending !== 'ACCEPTED' && !dispatch && (
        <HrmModal
          title={OFFER_STATUS_ACTION_LABELS[pending]}
          description={describeOfferStatusAction(pending, candidateName || 'the candidate', status)}
          onClose={close}
          busy={saving}
          lockDismiss={saving || Boolean(reason.trim())}
          size="sm"
          error={error}
          footer={(
            <div className="flex justify-end gap-2">
              <button type="button" onClick={close} disabled={saving} className="rounded-xl bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={saving || (pending === 'SENT' && !chosen.length)}
                className="rounded-xl bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-black hover:bg-[#e5ad06] disabled:opacity-50"
              >
                {saving ? (pending === 'SENT' ? 'Sending…' : 'Saving…') : OFFER_STATUS_ACTION_LABELS[pending]}
              </button>
            </div>
          )}
        >
          {pending === 'SENT' ? (
            <fieldset>
              <legend className="text-xs font-semibold text-gray-700">Send the new link by</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OFFER_CHANNELS.map((channel) => (
                  <label key={channel} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${channels[channel] ? 'border-amber-300 bg-amber-50 text-gray-900' : 'border-gray-200 text-gray-600'}`}>
                    <input type="checkbox" checked={channels[channel]} disabled={saving} onChange={(event) => toggleChannel(channel, event.target.checked)} />
                    {OFFER_CHANNEL_LABELS[channel]}
                  </label>
                ))}
              </div>
              {!chosen.length ? <p className="mt-2 text-xs font-medium text-rose-600">Choose at least one channel.</p> : null}
              <p className="mt-3 text-xs text-gray-600">A new link is created; the previous link stops working everywhere (email, WhatsApp and SMS), including messages already sent.</p>
            </fieldset>
          ) : statusChangeNeedsReason(pending) ? (
            <label className="block text-xs font-semibold text-gray-700">
              Reason *
              <textarea
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900"
                placeholder={pending === 'DECLINED' ? 'Why the candidate declined' : 'Why the offer is withdrawn'}
              />
            </label>
          ) : (
            <p className="text-xs text-gray-600">This cannot be undone from here.</p>
          )}
        </HrmModal>
      )}
    </>
  );
}
