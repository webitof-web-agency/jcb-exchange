'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown } from 'lucide-react';

export type InterviewStatus = 'SCHEDULED' | 'RESCHEDULED' | 'CANCELLED' | 'COMPLETED';

export const INTERVIEW_STATUS_OPTIONS: Array<{ value: InterviewStatus; label: string }> = [
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'RESCHEDULED', label: 'Rescheduled' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const statusTone: Record<InterviewStatus, string> = {
  SCHEDULED: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  RESCHEDULED: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
};

export const getInterviewStatusLabel = (status: string) =>
  INTERVIEW_STATUS_OPTIONS.find((option) => option.value === status)?.label || status.replaceAll('_', ' ');

export default function InterviewStatusDropdown({
  value,
  onChange,
  disabled = false,
}: {
  value: InterviewStatus;
  onChange: (status: InterviewStatus) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; isUp: boolean }>({ top: 0, left: 0, isUp: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedLabel = getInterviewStatusLabel(value);

  const updateCoords = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const isUp = spaceBelow < 220 && rect.top > 220;
    setCoords({
      top: isUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(10, Math.min(rect.left, window.innerWidth - 160)),
      isUp,
    });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (!isOpen) {
      updateCoords();
    }
    setIsOpen((open) => !open);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      updateCoords();
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={handleToggle}
        className={`inline-flex min-w-[124px] items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all shadow-2xs cursor-pointer ${statusTone[value] || 'border-gray-200 bg-gray-50 text-gray-700'} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {selectedLabel}
        </span>
        <ChevronDown size={13} className={`shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            ...(coords.isUp
              ? { bottom: `${window.innerHeight - coords.top}px` }
              : { top: `${coords.top}px` }),
          }}
          className="z-[99999] min-w-[160px] rounded-2xl border border-gray-200/90 bg-white p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {INTERVIEW_STATUS_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                  selected ? 'bg-amber-50 font-extrabold text-gray-950 shadow-2xs' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-950'
                }`}
              >
                <span>{option.label}</span>
                {selected && <CheckCircle2 size={14} className="shrink-0 text-[#E5A700] stroke-[2.5]" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
