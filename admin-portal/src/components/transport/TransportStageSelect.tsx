'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type TransportStageOption = { key: string; label: string };

type TransportStageSelectProps = {
  /** Every stage of the procedure, in order. */
  stages: TransportStageOption[];
  /** Stage the shipment is in right now. */
  currentKey: string;
  /** Stage chosen for the update. Starts on the current stage; any stage can be chosen. */
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  /** id of the visible label, so screen readers announce the field name. */
  labelId?: string;
};

type StageState = 'done' | 'current' | 'next' | 'later';

const TAG: Record<StageState, string> = { done: 'Completed', current: 'Current', next: 'Next', later: '' };

/**
 * Dropdown that lists the whole delivery procedure in order and marks where the shipment is.
 * It opens on the current stage, and any stage can be picked with the mouse or the keyboard
 * (Arrow keys, Home, End, Enter or Space, Escape).
 */
export default function TransportStageSelect({ stages, currentKey, value, onChange, disabled = false, labelId }: TransportStageSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const buttonId = `${baseId}-button`;
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const currentIndex = stages.findIndex((stage) => stage.key === currentKey);
  const selectedIndex = Math.max(0, stages.findIndex((stage) => stage.key === value));
  const stateOf = (index: number): StageState => {
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'current';
    return index === currentIndex + 1 ? 'next' : 'later';
  };
  const selected = stages[selectedIndex];

  const openMenu = () => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const choose = (index: number) => {
    const stage = stages[index];
    if (stage) onChange(stage.key);
    setOpen(false);
  };

  // Close on outside click. Escape is caught in the capture phase so it closes only this menu,
  // never the dialog that contains it.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape, true);
    };
  }, [open]);

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const last = stages.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((index) => (index >= last ? 0 : index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) openMenu();
        else setActiveIndex((index) => (index <= 0 ? last : index - 1));
        break;
      case 'Home':
        if (open) { event.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (open) { event.preventDefault(); setActiveIndex(last); }
        break;
      case 'Enter':
        event.preventDefault();
        if (open) choose(activeIndex);
        else openMenu();
        break;
      case ' ':
        // Acted on in keyup: Firefox fires the button's click on Space keyup, which would undo a keydown action.
        event.preventDefault();
        break;
      case 'Tab':
        // Select-only combobox pattern: Tab keeps the highlighted stage and moves focus on.
        if (open) choose(activeIndex);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        id={buttonId}
        type="button"
        disabled={disabled || stages.length === 0}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={labelId ? `${labelId} ${buttonId}` : undefined}
        aria-activedescendant={open ? optionId(activeIndex) : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onButtonKeyDown}
        onKeyUp={(event) => {
          if (event.key !== ' ') return;
          event.preventDefault();
          if (open) choose(activeIndex);
          else openMenu();
        }}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-sm font-medium text-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 ${
          open ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{selected?.label ?? 'Select stage'}</span>
          {selected && selected.key === currentKey ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Current</span>
          ) : null}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {stages.map((stage, index) => {
            const state = stateOf(index);
            const isSelected = index === selectedIndex;
            const isActive = index === activeIndex;
            return (
              <li
                key={stage.key}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm transition-colors ${
                  isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'
                } ${isActive ? 'bg-amber-50' : ''}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                      isSelected ? 'bg-amber-400 text-slate-900' : state === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {state === 'done' && !isSelected ? <Check className="h-3 w-3" /> : index + 1}
                  </span>
                  <span className="truncate">{stage.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {TAG[state] ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        state === 'current' ? 'bg-slate-800 text-white' : state === 'next' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {TAG[state]}
                    </span>
                  ) : null}
                  {isSelected ? <Check className="h-4 w-4 text-amber-600" aria-hidden="true" /> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
