'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown } from 'lucide-react';

export type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

const OFFER_STATUS_OPTIONS: Array<{ value: OfferStatus; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'EXPIRED', label: 'Expired' },
];

const getStatusBadgeStyle = (status: OfferStatus) => {
  switch (status) {
    case 'ACCEPTED':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200/90 hover:bg-emerald-100/80';
    case 'SENT':
      return 'bg-blue-50 text-blue-800 border-blue-200/90 hover:bg-blue-100/80';
    case 'DRAFT':
      return 'bg-amber-50 text-amber-800 border-amber-200/90 hover:bg-amber-100/80';
    case 'DECLINED':
      return 'bg-rose-50 text-rose-800 border-rose-200/90 hover:bg-rose-100/80';
    case 'EXPIRED':
      return 'bg-gray-100 text-gray-700 border-gray-200/90 hover:bg-gray-200/80';
    default:
      return 'bg-gray-50 text-gray-800 border-gray-200/90 hover:bg-gray-100';
  }
};

export default function OfferStatusDropdown({
  value,
  onChange,
  disabled = false,
}: {
  value: OfferStatus;
  onChange: (value: OfferStatus) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; isUp: boolean }>({ top: 0, left: 0, isUp: false });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = OFFER_STATUS_OPTIONS.find((option) => option.value === value) || OFFER_STATUS_OPTIONS[0];

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
    setIsOpen((prev) => !prev);
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
        onClick={handleToggle}
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all shadow-2xs ${getStatusBadgeStyle(value)} ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{selected.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: `${coords.left}px`,
            ...(coords.isUp
              ? { bottom: `${window.innerHeight - coords.top}px` }
              : { top: `${coords.top}px` }),
          }}
          className="z-[99999] min-w-[145px] rounded-2xl border border-gray-200/90 bg-white p-1.5 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-0.5" role="listbox">
            {OFFER_STATUS_OPTIONS.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-50 font-extrabold text-gray-950 shadow-2xs'
                      : 'font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-950'
                  }`}
                >
                  <span>{option.label}</span>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-[#E5A700] stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

