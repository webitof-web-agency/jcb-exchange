'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Navigation, X } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import TransportStageSelect from './TransportStageSelect';
import { TRANSPORT_STAGES, normalizeTransportStage, transportStageLabel } from './transportStages';

type TransportStatusModalProps = {
  transportId: string;
  /** Status the shipment is in right now (raw value from the API). */
  status: string;
  machineLabel: string;
  customerName?: string | null;
  canManage: boolean;
  onClose: () => void;
  /** Called after a successful update so the caller can reload its data. */
  onUpdated: () => void;
};

type StatusResponse = { notification?: { sent: boolean; message: string } | null };

/**
 * The one status dialog used by both the shipment list and the shipment detail page.
 * The dropdown opens on the shipment's current stage; Update is enabled only after a different stage is chosen.
 */
export default function TransportStatusModal({
  transportId,
  status,
  machineLabel,
  customerName,
  canManage,
  onClose,
  onUpdated,
}: TransportStatusModalProps) {
  const currentStage = normalizeTransportStage(status);
  const [stage, setStage] = useState(currentStage);
  const [notes, setNotes] = useState('');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [saving, setSaving] = useState(false);

  const changed = stage !== currentStage;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes the dialog (the stage menu swallows its own Escape first).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  // Move focus into the dialog on open, keep Tab inside it, and give focus back on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea, input, [tabindex]:not([tabindex="-1"])') ?? [],
    );
    (dialog?.querySelector<HTMLElement>('[role="combobox"]:not([disabled])') ?? focusable()[0] ?? dialog)?.focus();
    const onTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      // While saving every control is disabled, and focus may have dropped out of the dialog: keep it inside.
      if (!first || !last || !dialog.contains(document.activeElement)) {
        event.preventDefault();
        (first ?? dialog).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      previouslyFocused?.focus?.();
    };
  }, []);

  const handleSave = async () => {
    if (!changed) return;
    setSaving(true);
    try {
      const res = await api.post<StatusResponse>(`/vehicle-transports/${transportId}/status`, { status: stage, notes, sendWhatsApp });
      toast.success(`Status updated to ${transportStageLabel(stage)}.`);
      const notification = res.data.notification;
      if (notification) {
        if (notification.sent) toast.success(notification.message);
        else toast.warn(`WhatsApp not sent: ${notification.message}`);
      }
      onUpdated();
      onClose();
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="transport-status-title" className="m-auto w-full max-w-md rounded-2xl bg-white shadow-2xl focus:outline-none">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Navigation className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 id="transport-status-title" className="text-base font-semibold text-slate-900">Update Transport Status</h3>
              <p className="mt-0.5 truncate text-xs text-slate-500" title={machineLabel}>{machineLabel}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div>
            <span id="transport-stage-label" className="mb-1.5 block text-xs font-semibold text-slate-700">Shipment stage</span>
            <TransportStageSelect
              stages={TRANSPORT_STAGES}
              currentKey={currentStage}
              value={stage}
              onChange={setStage}
              disabled={!canManage || saving}
              labelId="transport-stage-label"
            />
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {changed ? (
                <>
                  <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{transportStageLabel(currentStage)}</span>
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">{transportStageLabel(stage)}</span>
                </>
              ) : (
                <span className="text-slate-500">Currently at <strong className="text-slate-700">{transportStageLabel(currentStage)}</strong>. Pick a different stage to update.</span>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="transport-status-notes" className="mb-1.5 block text-xs font-semibold text-slate-700">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              id="transport-status-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add a remark for the tracking history"
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
            <input
              type="checkbox"
              checked={sendWhatsApp}
              onChange={(e) => setSendWhatsApp(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded accent-amber-500"
            />
            <span className="text-xs leading-relaxed text-slate-600">
              Send WhatsApp update with the Delivery Challan
              {customerName ? <> to <strong className="text-slate-800">{customerName}</strong></> : ' to the customer'}
            </span>
          </label>
        </div>

        <div className="flex gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !canManage || !changed}
            className="flex-1 rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  );
}
