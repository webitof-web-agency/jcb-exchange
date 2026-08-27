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
