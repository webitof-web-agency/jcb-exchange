import { DEFAULT_LOCALE, type AppLocale } from './config';

export const formatDateTime = (
  value: string | number | Date,
  locale: AppLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
) =>
  new Intl.DateTimeFormat(locale, options ?? {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const formatDate = (
  value: string | number | Date,
  locale: AppLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
) => new Intl.DateTimeFormat(locale, options).format(new Date(value));

export const formatNumber = (value: number, locale: AppLocale = DEFAULT_LOCALE, options?: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat(locale, options).format(value);

export const formatCurrency = (
  value: number,
  locale: AppLocale = DEFAULT_LOCALE,
  currency = 'INR',
) => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
