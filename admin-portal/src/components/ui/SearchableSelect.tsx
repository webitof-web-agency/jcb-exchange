'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from '@/hooks/useTranslation';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Option = {
  id: string | number;
  name: string;
};

type SearchableSelectProps = {
  options: Option[];
  value: string | number; // usually ID
  displayValue?: string; // fallback string for display
  onChange: (option: Option) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
};

export default function SearchableSelect({
  options,
  value,
  displayValue: overrideDisplayValue,
  onChange,
  placeholder,
  disabled = false,
  className,
  searchable = true,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const resolvedPlaceholder = placeholder ?? t('common.selectAnOption');
  const fallbackLabel =
    typeof overrideDisplayValue === 'string' && overrideDisplayValue.trim()
      ? overrideDisplayValue.trim()
      : typeof value === 'string' && value.trim()
        ? value.trim()
        : '';

  const resolvedOptions = useMemo(() => {
    if (!fallbackLabel) {
      return options;
    }

    const hasMatchingOption = options.some(
      (option) =>
        String(option.id).trim() === String(value).trim() ||
        String(option.name ?? '').trim().toLowerCase() === fallbackLabel.toLowerCase()
    );

    if (hasMatchingOption) {
      return options;
    }

    return [{ id: `__current__:${fallbackLabel}`, name: fallbackLabel }, ...options];
  }, [fallbackLabel, options, value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = resolvedOptions.filter((option) =>
    String(option.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedOption = resolvedOptions.find(
    (opt) => String(opt.id).trim() === String(value).trim() || String(opt.name ?? '').trim() === String(value).trim()
  );
  const displayValue = selectedOption ? String(selectedOption.name ?? '') : fallbackLabel;

  return (
    <div className={cn("relative w-full", className)} ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (!nextOpen) {
            setSearchQuery('');
          }
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60",
          !displayValue && "text-gray-500"
        )}
      >
        <span className="truncate">{displayValue || resolvedPlaceholder}</span>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-2xl border border-gray-200 bg-white p-1.5 shadow-xl transition-all">
          {searchable && (
            <div className="sticky top-0 z-10 bg-white pb-1.5 pt-0.5 px-0.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="w-full rounded-xl bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:bg-gray-100/80 transition"
                  placeholder={t('common.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-gray-500">{t('common.noResultsFound')}</li>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = String(option.id) === String(value) || String(option.name ?? '') === String(value);
                return (
                  <li
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900",
                      isSelected && "bg-amber-50 font-medium text-amber-900 hover:bg-amber-100/70"
                    )}
                    onClick={() => {
                      onChange(option);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <span className="truncate">{String(option.name ?? '')}</span>
                    {isSelected && <Check className="h-4 w-4 text-amber-600 shrink-0 ml-2" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
