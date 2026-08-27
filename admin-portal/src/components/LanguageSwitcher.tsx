'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale } from '@/lib/i18n/config';
import { useTranslation } from '@/hooks/useTranslation';
import { useLanguageStore } from '@/store/languageStore';

type LanguageSwitcherProps = {
  className?: string;
  tone?: 'dark' | 'light';
  align?: 'left' | 'right' | 'auto';
};

export default function LanguageSwitcher({
  className = '',
  tone = 'light',
  align = 'auto',
}: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const locale = useLanguageStore((state) => state.locale);
  const setLocale = useLanguageStore((state) => state.setLocale);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (selectedLocale: AppLocale) => {
    setLocale(selectedLocale);
    setIsOpen(false);
  };

  const currentLabel = LOCALE_LABELS[locale]?.nativeName || 'English';
  const isDark = tone === 'dark';
  const isFullWidth = className.includes('w-full');

  const alignClasses = isFullWidth
    ? 'left-0 right-0 w-full'
    : align === 'left'
    ? 'left-0'
    : 'right-0';

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={t('common.language')}
        className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 text-xs font-semibold transition-all duration-150 focus:outline-none ${
          isDark
            ? 'border border-white/20 bg-neutral-900 text-white hover:bg-neutral-800 hover:border-white/30 active:bg-neutral-800'
            : 'border border-gray-200 bg-white text-gray-800 shadow-sm hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100'
        }`}
      >
        <Globe className={`h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0 ${isDark ? 'text-[#FFC107]' : 'text-gray-600'}`} />
        <span className="font-medium hidden sm:inline">{currentLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 hidden sm:inline transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          } ${isDark ? 'text-gray-300' : 'text-gray-400'}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full z-[9999] mt-2 min-w-[150px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] transition-all transform ${
            align === 'left' ? 'origin-top-left' : 'origin-top-right'
          } ${alignClasses}`}
        >
          <div className="space-y-0.5">
            {SUPPORTED_LOCALES.map((supportedLocale) => {
              const isSelected = supportedLocale === locale;
              const { nativeName, englishName } = LOCALE_LABELS[supportedLocale];

              return (
                <button
                  key={supportedLocale}
                  type="button"
                  onClick={() => handleSelect(supportedLocale)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition-colors duration-150 ${
                    isSelected
                      ? 'bg-amber-50/80 font-bold text-gray-950'
                      : 'text-gray-700 font-medium hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="leading-tight text-[13px] text-gray-900 font-semibold">{nativeName}</span>
                    {englishName !== nativeName && (
                      <span className="text-[10px] text-gray-500 font-normal">
                        {englishName}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
