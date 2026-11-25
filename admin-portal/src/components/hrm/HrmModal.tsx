'use client';

import { useEffect, useId, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { bodyScrollLock } from '@/lib/bodyScrollLock';

/**
 * Dialog shell used by the HRM organisation screens: title bar, scrolling body, footer slot, Escape to close
 * (ignored while busy or while a dropdown list is open), Tab kept inside, and no scrolling behind it.
 *
 * `error` is the server's answer to a failed save. It is shown right above the footer buttons, outside the scrolling
 * body (so it is never scrolled out of sight on a phone) and takes the focus when it appears.
 *
 * `lockDismiss` is for a dialog that holds something that cannot be recovered (a one-time password, typed but unsaved
 * work): Escape and a click on the backdrop then do nothing. The X button and the dialog's own Cancel / Done buttons
 * still close it, so leaving stays a deliberate act.
 */
export default function HrmModal({
  title,
  description,
  onClose,
  busy = false,
  lockDismiss = false,
  size = 'md',
  error = '',
  footer,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  busy?: boolean;
  lockDismiss?: boolean;
  size?: 'sm' | 'md' | 'lg';
  error?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  /** What had the focus when the dialog opened (the button that opened it); kept for the dialog's whole life. */
  const openerRef = useRef<HTMLElement | null>(null);

  // Declared before the autofocus effect, so it records the opener before focus moves into the dialog. When the dialog
  // closes the focus goes back there, unless that element is gone or the person already moved on to something else.
  useEffect(() => {
    if (!openerRef.current && document.activeElement instanceof HTMLElement && document.activeElement !== document.body) openerRef.current = document.activeElement;
    const opener = openerRef.current;
    return () => {
      if (!opener || !opener.isConnected) return;
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      opener.focus();
    };
  }, []);

  useEffect(() => {
    // Capture phase: a dropdown closes its own list on Escape, and by the time a bubbling listener runs the list
    // is already gone, so one Escape would close the dropdown and the dialog together.
    const onKeyDown = (event: KeyboardEvent) => {
      const listOpen = Boolean(document.querySelector('[role="listbox"]'));
      if (event.key === 'Escape') {
        // A field marked data-escape-local (an inline rename box) uses Escape to cancel itself, not to close the dialog.
        const local = event.target instanceof Element && event.target.closest('[data-escape-local]');
        if (!busy && !lockDismiss && !listOpen && !local) onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current || listOpen) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])')).filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (!(active instanceof Node) || !dialogRef.current.contains(active)) { event.preventDefault(); first.focus(); return; }
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [busy, lockDismiss, onClose]);

  // The page behind does not scroll while the dialog is open. The lock is shared (reference counted), so a dialog
  // opened on top of another one cannot leave the page locked or unlocked when it closes.
  useEffect(() => bodyScrollLock.acquire(), []);

  // Start on the first real field instead of the close button. A dropdown's hidden read-only mirror input does not
  // count (focusing it shows nothing), and an input marked data-no-autofocus (a field below a long checklist) is skipped.
  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    const field = root.querySelector<HTMLElement>('[data-autofocus]')
      ?? root.querySelector<HTMLElement>('input:not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly]):not([tabindex="-1"]):not([data-no-autofocus]), textarea:not([disabled]), button[aria-haspopup="listbox"]:not([disabled])')
      ?? root.querySelector<HTMLElement>('input[type="checkbox"]:not([disabled])')
      ?? root.querySelector<HTMLElement>('button:not([disabled])');
    field?.focus();
  }, []);

  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-4" onMouseDown={() => { if (!busy && !lockDismiss && !document.querySelector('[role="listbox"]')) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} onMouseDown={(event) => event.stopPropagation()} className={`flex max-h-[calc(100dvh-1.5rem)] w-full ${width} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-slate-950">{title}</h2>
            {description ? <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 outline-none sm:mx-6"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
        {footer ? <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
      </div>
    </div>
  );
}
