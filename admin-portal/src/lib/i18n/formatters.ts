import { DEFAULT_LOCALE, type AppLocale } from './config';

type DateValue = string | number | Date;

const DISPLAY_DATE_LOCALE = 'en-GB';
const DISPLAY_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

export const formatDate = (value: DateValue) =>
  new Intl.DateTimeFormat(DISPLAY_DATE_LOCALE, DISPLAY_DATE_OPTIONS).format(new Date(value));

export const formatDateTime = (
  value: DateValue,
  locale: AppLocale = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
) =>
  options
    ? new Intl.DateTimeFormat(locale, options).format(new Date(value))
    : `${formatDate(value)}, ${new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))}`;
