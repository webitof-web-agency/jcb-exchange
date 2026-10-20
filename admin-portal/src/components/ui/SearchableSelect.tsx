'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  required?: boolean;
  className?: string;
  buttonClassName?: string;
  size?: 'sm' | 'md';
  searchable?: boolean;
  highlighted?: boolean;
};

export default function SearchableSelect({
  options,
  value,
  displayValue: overrideDisplayValue,
  onChange,
  placeholder,
  disabled = false,
  required = false,
  className,
  buttonClassName,
  size = 'md',
  searchable = true,
  highlighted = false,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
  } | null>(null);

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

  const filteredOptions = useMemo(
    () =>
      resolvedOptions.filter((option) =>
        String(option.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [resolvedOptions, searchQuery]
  );

  const selectedOption = useMemo(
    () =>
      resolvedOptions.find(
        (opt) => String(opt.id).trim() === String(value).trim() || String(opt.name ?? '').trim() === String(value).trim()
      ),
    [resolvedOptions, value]
  );

  const displayValue = selectedOption ? String(selectedOption.name ?? '') : fallbackLabel;

  const calculatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Prefer opening down unless there is not enough room below (< 220px) and more space above
    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableSpace = openUp ? spaceAbove - 16 : spaceBelow - 16;
    const maxHeight = Math.max(140, Math.min(260, availableSpace));

    const top = openUp ? rect.top - maxHeight - 6 : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.left, viewportWidth - rect.width - 8));

    setCoords({
      top,
      left,
      width: rect.width,
      maxHeight,
      openUp,
    });
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    const nextOpen = !isOpen;
    if (nextOpen) {
      calculatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    calculatePosition();

    const handleScroll = (event: Event) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return;
      }
      calculatePosition();
    };

    const handleResize = () => calculatePosition();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, calculatePosition]);

  return (
    <div className={cn("relative w-full", className)} ref={wrapperRef} aria-invalid={required && !displayValue}>
      <input
        type="text"
        value={displayValue}
        readOnly
        required={required}
        tabIndex={required ? 0 : -1}
        aria-label={resolvedPlaceholder}
        className="sr-only"
      />
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border border-gray-200 bg-[#F8FAFC] text-gray-900 outline-none transition focus:border-[#FFC107] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer",
          size === 'sm' ? "px-2.5 py-1.5 text-xs h-[34px]" : "px-3 py-2.5 text-sm",
          highlighted && "border-[#d59f00] bg-amber-100 font-semibold text-gray-950 shadow-sm",
          !displayValue && "text-gray-500",
          buttonClassName
        )}
      >
        <span className="truncate">{displayValue || resolvedPlaceholder}</span>
        <ChevronDown className={cn("h-4 w-4 text-gray-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen &&
        coords &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
            }}
            className="z-[999999] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {searchable && (
              <div className="shrink-0 bg-white pb-1.5 pt-0.5 px-0.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    autoFocus
                    className={cn(
                      "w-full rounded-lg bg-gray-50 pl-8 pr-2.5 text-gray-900 outline-none placeholder:text-gray-400 focus:bg-gray-100 transition",
                      size === 'sm' ? "py-1.5 text-xs" : "py-2 text-sm"
                    )}
                    placeholder={t('common.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
            <ul className="flex-1 overflow-y-auto flex flex-col gap-0.5 [scrollbar-width:thin]">
              {filteredOptions.length === 0 ? (
                <li className={cn("px-3 text-gray-500", size === 'sm' ? "py-2 text-xs" : "py-2.5 text-sm")}>
                  {t('common.noResultsFound')}
                </li>
              ) : (
                filteredOptions.map((option) => {
                  const isSelected = String(option.id) === String(value) || String(option.name ?? '') === String(value);
                  return (
                    <li
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg transition-colors hover:bg-gray-100 hover:text-gray-900",
                        size === 'sm' ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
                        isSelected && "bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100/70"
                      )}
                      onClick={() => {
                        onChange(option);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                    >
                      <span className="truncate">{String(option.name ?? '')}</span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-amber-600 shrink-0 ml-2" />}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
