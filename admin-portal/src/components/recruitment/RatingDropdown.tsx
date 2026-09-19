'use client';

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown } from 'lucide-react';

interface RatingDropdownProps {
  value: string;
  onChange: (value: string) => void;
  labelTemplate: (value: number) => string;
  isBold?: boolean;
}

export default function RatingDropdown({ value, onChange, labelTemplate, isBold = false }: RatingDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block w-full text-left" ref={dropdownRef} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer ${isBold ? 'font-bold' : 'font-semibold'}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{value ? labelTemplate(Number(value)) : 'Select'}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-[100] mt-1.5 w-full min-w-[130px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-64 overflow-y-auto space-y-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" role="listbox">
            {[5, 4, 3, 2, 1].map((rating) => {
              const isSelected = rating.toString() === value;
              return (
                <button
                  key={rating}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(rating.toString());
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 ${isSelected
                    ? 'bg-amber-50/80 font-bold text-gray-950'
                    : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                    }`}
                >
                  <span className="leading-tight text-[13px]">{labelTemplate(rating)}</span>
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
