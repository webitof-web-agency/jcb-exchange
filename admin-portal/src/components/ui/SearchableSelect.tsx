'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X, Loader2 } from 'lucide-react';
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
  size?: 'sm' | 'md' | 'portal';
  searchable?: boolean;
  highlighted?: boolean;
  id?: string;
  loading?: boolean;
  minMenuWidth?: number;
  align?: 'left' | 'right' | 'auto';
  clearable?: boolean;
  onClear?: () => void;
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
  id,
  loading = false,
  minMenuWidth,
  align = 'auto',
  clearable = false,
  onClear,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const filteredOptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return resolvedOptions;
    return resolvedOptions.filter((option) =>
      String(option.name ?? '').toLowerCase().includes(query)
    );
  }, [resolvedOptions, searchQuery]);

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
    const maxHeight = Math.max(140, Math.min(280, availableSpace));

    // Detect closest modal / card container so the dropdown stays inside the modal
    const modalContainer = (wrapperRef.current?.closest('[role="dialog"], .rounded-2xl, .rounded-3xl, form') ||
      wrapperRef.current?.closest('.bg-white')) as HTMLElement | null;

    const boundaryLeft = modalContainer ? Math.max(8, modalContainer.getBoundingClientRect().left + 8) : 8;
    const boundaryRight = modalContainer ? Math.min(viewportWidth - 8, modalContainer.getBoundingClientRect().right - 8) : viewportWidth - 8;
    const availableContainerWidth = Math.max(160, boundaryRight - boundaryLeft);

    // Ensure comfortable width for searching and reading option names
    const defaultMinWidth = size === 'portal' ? 240 : size === 'sm' ? 180 : 220;
    const targetWidth = Math.max(minMenuWidth ?? defaultMinWidth, rect.width);
    const menuWidth = Math.min(targetWidth, availableContainerWidth);

    const top = openUp ? rect.top - maxHeight - 6 : rect.bottom + 6;

    // Determine alignment: if align='right' or auto-align when expanding right would overflow boundary
    const shouldAlignRight =
      align === 'right' ||
      (align !== 'left' && rect.left + menuWidth > boundaryRight);

    let left = shouldAlignRight ? rect.right - menuWidth : rect.left;

    // Strictly clamp within the modal / container boundary and viewport
    if (left + menuWidth > boundaryRight) {
      left = boundaryRight - menuWidth;
    }
    if (left < boundaryLeft) {
      left = boundaryLeft;
    }

    setCoords({
      top,
      left,
      width: menuWidth,
      maxHeight,
      openUp,
    });
  }, [align, minMenuWidth, size]);

  const handleToggle = () => {
    if (disabled || loading) return;
    const nextOpen = !isOpen;
    if (nextOpen) {
      calculatePosition();
      setIsOpen(true);
      setActiveIndex(0);
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setSearchQuery('');
        buttonRef.current?.focus();
      }
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, calculatePosition]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setSearchQuery('');
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[activeIndex]) {
        onChange(filteredOptions[activeIndex]);
        setIsOpen(false);
        setSearchQuery('');
        buttonRef.current?.focus();
      }
    }
  };

  const sizeClass = {
    sm: "px-2.5 py-1.5 text-xs h-[34px] rounded-lg border-gray-200",
    md: "px-3 py-2.5 text-sm rounded-lg border-gray-200",
    portal: "h-11 px-3 text-xs rounded-xl bg-zinc-50/70 hover:bg-zinc-50 border-zinc-200 hover:border-zinc-300 text-zinc-900 font-normal",
  }[size];

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
        id={id}
        type="button"
        disabled={disabled || loading}
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={cn(
          "flex w-full items-center justify-between border bg-[#F8FAFC] text-gray-900 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer select-none",
          sizeClass,
          isOpen
            ? "border-amber-500 ring-4 ring-amber-500/15 bg-white text-zinc-950 shadow-sm"
            : "focus:border-amber-500 focus:ring-4 focus:ring-amber-500/15",
          highlighted && "border-[#d59f00] bg-amber-100 font-semibold text-gray-950 shadow-sm",
          !displayValue && "text-zinc-400 font-normal",
          buttonClassName
        )}
      >
        <span className="truncate text-left flex-1 mr-1">
          {loading ? (placeholder ?? 'Loading…') : (displayValue || resolvedPlaceholder)}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {clearable && displayValue && !disabled && !loading && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear selection"
              onClick={(e) => {
                e.stopPropagation();
                if (onClear) onClear();
                else onChange({ id: '', name: '' });
              }}
              className="p-0.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 transition"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
          ) : (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-zinc-400 transition-transform duration-200",
                isOpen && "rotate-180 text-amber-500"
              )}
            />
          )}
        </div>
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
            className="z-[999999] flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {searchable && (
              <div className="shrink-0 bg-white pb-1.5 pt-0.5 px-0.5 border-b border-zinc-100 mb-1">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    autoFocus
                    className={cn(
                      "w-full rounded-lg bg-zinc-50 pl-8 pr-7 text-zinc-900 outline-none placeholder:text-zinc-400 focus:bg-white focus:ring-2 focus:ring-amber-500/20 border border-zinc-200/70 transition",
                      size === 'sm' ? "py-1.5 text-xs" : "py-2 text-xs sm:text-sm"
                    )}
                    placeholder={t('common.searchPlaceholder') || 'Search...'}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleInputKeyDown}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearchQuery('');
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}
            <ul
              role="listbox"
              className="flex-1 overflow-y-auto flex flex-col gap-0.5 [scrollbar-width:thin] text-left"
            >
              {filteredOptions.length === 0 ? (
                <li className={cn("px-3 text-zinc-500 text-center py-4", size === 'sm' ? "text-xs" : "text-xs sm:text-sm")}>
                  {t('common.noResultsFound') || 'No options found'}
                </li>
              ) : (
                filteredOptions.map((option, idx) => {
                  const isSelected = String(option.id) === String(value) || String(option.name ?? '') === String(value);
                  const isFocused = idx === activeIndex;
                  return (
                    <li
                      key={option.id}
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        "flex cursor-pointer items-center justify-between rounded-lg transition-colors",
                        size === 'sm' ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-xs sm:text-sm",
                        isSelected
                          ? "bg-amber-50 font-semibold text-amber-900 hover:bg-amber-100/70"
                          : isFocused
                          ? "bg-zinc-100 text-zinc-900"
                          : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                      )}
                      onMouseEnter={() => setActiveIndex(idx)}
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
