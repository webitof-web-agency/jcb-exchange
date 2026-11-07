'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Search,
  Table as TableIcon,
  X,
} from 'lucide-react';
import { formatDateInput, getCalendarCells, parseDateInput } from '@/lib/partnerDirectoryCalendar.mjs';

export interface PartnerDirectoryFilterOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomDropdownProps {
  value: string;
  options: PartnerDirectoryFilterOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
}

function CustomDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  searchable = false,
  className = '',
}: CustomDropdownProps) {
  const dropdownId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
    };
  }, [open]);

  const selectedOption = options.find((option) => option.value === value);
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return options;

    return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
  }, [options, query]);

  const selectOption = (option: PartnerDirectoryFilterOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className={`filter-dropdown-container relative ${className}`}>
      <button
        type="button"
        className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs font-semibold text-slate-700 shadow-2xs outline-none transition hover:border-slate-300 focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={dropdownId}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === 'Escape') setOpen(false);
        }}
      >
        <span className="truncate">{selectedOption?.label || options[0]?.label || 'Select'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          id={dropdownId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          {searchable ? (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search options..."
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs text-slate-800 outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                aria-label={`Search ${ariaLabel.toLowerCase()}`}
              />
            </div>
          ) : null}

          <div className="max-h-60 overflow-y-auto pr-0.5">
            {visibleOptions.length ? (
              visibleOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => selectOption(option)}
                    className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                      option.disabled
                        ? 'cursor-not-allowed text-slate-400'
                        : isSelected
                          ? 'bg-amber-50 font-bold text-amber-900'
                          : 'cursor-pointer text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-amber-600" /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-2.5 py-3 text-xs text-slate-500">No matching options</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface CustomDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

function formatDateLabel(value: string) {
  const date = parseDateInput(value);
  if (!date) return 'dd-mm-yyyy';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function CustomDatePicker({ value, onChange, ariaLabel }: CustomDatePickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedDate = parseDateInput(value);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('touchstart', closeOnOutsideClick, { passive: true });
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('touchstart', closeOnOutsideClick);
    };
  }, [open]);

  const cells = getCalendarCells(viewDate.getFullYear(), viewDate.getMonth());
  const monthLabel = new Intl.DateTimeFormat('en-IN', {
    month: 'long',
    year: 'numeric',
  }).format(viewDate);

  const changeMonth = (offset: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1));
  };

  return (
    <div ref={pickerRef} className="filter-dropdown-container relative min-w-[148px]">
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-xs font-semibold text-slate-600 shadow-2xs outline-none transition hover:border-slate-300 focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) setViewDate(parseDateInput(value) || new Date());
          setOpen((current) => !current);
        }}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className={value ? 'text-slate-700' : 'text-slate-400'}>{formatDateLabel(value)}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[286px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/40"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-slate-900">{monthLabel}</span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/40"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const isSelected = cell.date === value;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => {
                    onChange(cell.date);
                    setOpen(false);
                  }}
                  aria-label={cell.date}
                  aria-pressed={isSelected}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs transition focus:outline-none focus:ring-2 focus:ring-[#FFC107]/40 ${
                    isSelected
                      ? 'bg-[#FFC107] font-bold text-slate-950 shadow-sm'
                      : cell.isCurrentMonth
                        ? 'cursor-pointer text-slate-700 hover:bg-amber-50 hover:text-amber-900'
                        : 'cursor-pointer text-slate-300 hover:bg-slate-50 hover:text-slate-500'
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              disabled={!value}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                onChange(formatDateInput(today));
                setViewDate(today);
                setOpen(false);
              }}
              className="min-h-8 rounded-lg px-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
            >
              Today
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface PartnerDirectoryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeChange: (value: string) => void;
  typeOptions: PartnerDirectoryFilterOption[];
  countryFilter: string;
  onCountryChange: (value: string) => void;
  countries: PartnerDirectoryFilterOption[];
  stateFilter: string;
  onStateChange: (value: string) => void;
  states: PartnerDirectoryFilterOption[];
  cityFilter: string;
  onCityChange: (value: string) => void;
  cities: PartnerDirectoryFilterOption[];
  gstStatusFilter: string;
  onGstStatusChange: (value: string) => void;
  gstStatusOptions: PartnerDirectoryFilterOption[];
  kycStatusFilter: string;
  onKycStatusChange: (value: string) => void;
  kycStatusOptions: PartnerDirectoryFilterOption[];
  accountStatusFilter: string;
  onAccountStatusChange: (value: string) => void;
  accountStatusOptions: PartnerDirectoryFilterOption[];
  archivedFilter: string;
  onArchivedChange: (value: string) => void;
  archivedOptions: PartnerDirectoryFilterOption[];
  sortBy: string;
  onSortChange: (value: string) => void;
  sortOptions: PartnerDirectoryFilterOption[];
  joinedFrom: string;
  onJoinedFromChange: (value: string) => void;
  joinedTo: string;
  onJoinedToChange: (value: string) => void;
  viewMode: 'table' | 'grid';
  onViewModeChange: (value: 'table' | 'grid') => void;
  hasFilters: boolean;
  onReset: () => void;
  locationError?: string;
}

export default function PartnerDirectoryFilters({
  search,
  onSearchChange,
  typeFilter,
  onTypeChange,
  typeOptions,
  countryFilter,
  onCountryChange,
  countries,
  stateFilter,
  onStateChange,
  states,
  cityFilter,
  onCityChange,
  cities,
  gstStatusFilter,
  onGstStatusChange,
  gstStatusOptions,
  kycStatusFilter,
  onKycStatusChange,
  kycStatusOptions,
  accountStatusFilter,
  onAccountStatusChange,
  accountStatusOptions,
  archivedFilter,
  onArchivedChange,
  archivedOptions,
  sortBy,
  onSortChange,
  sortOptions,
  joinedFrom,
  onJoinedFromChange,
  joinedTo,
  onJoinedToChange,
  viewMode,
  onViewModeChange,
  hasFilters,
  onReset,
  locationError,
}: PartnerDirectoryFiltersProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search business, owner, partner ID, state, city, GST..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-8 text-xs text-slate-900 outline-none transition focus:border-[#FFC107] focus:bg-white focus:ring-2 focus:ring-[#FFC107]/20 placeholder:text-slate-400"
            aria-label="Search partners"
          />
          {search ? (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/40"
              aria-label="Clear partner search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CustomDropdown
            value={typeFilter}
            options={typeOptions}
            onChange={onTypeChange}
            ariaLabel="Filter partners by type"
            searchable
            className="w-[168px]"
          />
          <CustomDropdown
            value={countryFilter}
            options={countries}
            onChange={onCountryChange}
            ariaLabel="Filter partners by country"
            searchable
            className="w-[158px]"
          />
          <CustomDropdown
            value={stateFilter}
            options={states}
            onChange={onStateChange}
            ariaLabel="Filter partners by state"
            disabled={!countryFilter || states.length <= 1}
            searchable
            className="w-[170px]"
          />
          <CustomDropdown
            value={cityFilter}
            options={cities}
            onChange={onCityChange}
            ariaLabel="Filter partners by city"
            disabled={!stateFilter || cities.length <= 1}
            searchable
            className="w-[132px]"
          />
           <CustomDropdown
             value={sortBy}
             options={sortOptions}
             onChange={onSortChange}
             ariaLabel="Sort partners"
             className="w-[178px]"
           />
          <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Partner directory view mode">
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-[#FFC107]/40 ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-label="Table view"
              aria-pressed={viewMode === 'table'}
              title="Table view"
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              className={`flex h-8 w-8 items-center justify-center rounded-md transition focus:outline-none focus:ring-2 focus:ring-[#FFC107]/40 ${
                viewMode === 'grid'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              title="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
         </div>
      </div>

      {locationError ? (
        <p className="text-[11px] font-medium text-amber-700" role="status">
          {locationError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
        <CustomDropdown
          value={gstStatusFilter}
          options={gstStatusOptions}
          onChange={onGstStatusChange}
          ariaLabel="Filter partners by GST verification status"
          className="w-[158px]"
        />
        <CustomDropdown
          value={kycStatusFilter}
          options={kycStatusOptions}
          onChange={onKycStatusChange}
          ariaLabel="Filter partners by KYC status"
          searchable
          className="w-[158px]"
        />
        <CustomDropdown
          value={accountStatusFilter}
          options={accountStatusOptions}
          onChange={onAccountStatusChange}
          ariaLabel="Filter partners by account status"
          className="w-[166px]"
        />
        <CustomDropdown
          value={archivedFilter}
          options={archivedOptions}
          onChange={onArchivedChange}
          ariaLabel="Filter archived partners"
          className="w-[152px]"
        />
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Joined from</span>
          <CustomDatePicker value={joinedFrom} onChange={onJoinedFromChange} ariaLabel="Joined from date" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">Joined to</span>
          <CustomDatePicker value={joinedTo} onChange={onJoinedToChange} ariaLabel="Joined to date" />
        </div>
        {hasFilters ? (
          <button
            type="button"
            onClick={onReset}
            className="h-9 rounded-lg px-2.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/30"
          >
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
