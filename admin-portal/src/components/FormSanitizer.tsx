'use client';

import { useEffect } from 'react';
import { caretAfterEdit, DEFAULT_MAX_LENGTH, resolveSanitizeKind, sanitizeFieldValue, type SanitizeKind } from '@/lib/formSanitizers';

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * Cleans every text field on the page while it is typed or pasted, and trims it on blur (rules in
 * lib/formSanitizers.ts). A field picks its rule with data-sanitize="mobile|pan|gstin|vehicle|...", otherwise
 * from its type / inputMode; data-sanitize="off" (on the field or a wrapper) leaves it alone, e.g. raw HTML
 * editors. Passwords, numbers, dates and files are never touched.
 *
 * The listener runs on window in the capture phase, before React's onChange, and writes through the native
 * value setter so React's change tracking sees the cleaned value and controlled state stays in sync.
 */
const resolveField = (target: EventTarget | null): { field: Field; kind: SanitizeKind } | null => {
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return null;
  if (target.readOnly || target.disabled) return null;
  const explicit = target.getAttribute('data-sanitize');
  if (!explicit && target.closest('[data-sanitize="off"]')) return null;
  const kind = resolveSanitizeKind({ tagName: target.tagName, type: target.type, inputMode: target.inputMode, explicit });
  return kind && kind !== 'off' ? { field: target, kind } : null;
};

const setNativeValue = (field: Field, value: string) => {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
};

const clean = (field: Field, kind: SanitizeKind, finalize: boolean, notify: boolean) => {
  const current = field.value;
  const max = field.maxLength > 0 ? field.maxLength : field instanceof HTMLTextAreaElement ? DEFAULT_MAX_LENGTH.textarea : DEFAULT_MAX_LENGTH.input;
  const next = sanitizeFieldValue(kind, current, finalize).slice(0, max);
  if (next === current) return;

  let caret: number | null = null;
  try { caret = field.selectionStart; } catch { caret = null; } // email inputs have no selection API
  setNativeValue(field, next);
  if (caret !== null && document.activeElement === field) {
    const position = caretAfterEdit(current, next, caret);
    try { field.setSelectionRange(position, position); } catch { /* not supported for this type */ }
  }
  if (notify) field.dispatchEvent(new Event('input', { bubbles: true }));
};

export default function FormSanitizer() {
  useEffect(() => {
    const onInput = (event: Event) => {
      if ((event as InputEvent).isComposing) return; // Hindi / IME typing: clean once composition ends
      const resolved = resolveField(event.target);
      if (resolved) clean(resolved.field, resolved.kind, false, false);
    };
    const onCompositionEnd = (event: Event) => {
      const resolved = resolveField(event.target);
      if (resolved) clean(resolved.field, resolved.kind, false, true);
    };
    const onBlur = (event: Event) => {
      const resolved = resolveField(event.target);
      if (resolved) clean(resolved.field, resolved.kind, true, true);
    };
    window.addEventListener('input', onInput, true);
    window.addEventListener('compositionend', onCompositionEnd, true);
    window.addEventListener('focusout', onBlur, true);
    return () => {
      window.removeEventListener('input', onInput, true);
      window.removeEventListener('compositionend', onCompositionEnd, true);
      window.removeEventListener('focusout', onBlur, true);
    };
  }, []);
  return null;
}
