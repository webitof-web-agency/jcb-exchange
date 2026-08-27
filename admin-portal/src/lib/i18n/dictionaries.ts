import en from '@/locales/en.json';
import gu from '@/locales/gu.json';
import hi from '@/locales/hi.json';
import mr from '@/locales/mr.json';
import te from '@/locales/te.json';
import type { AppLocale } from './config';

export type TranslationDictionary = Record<string, unknown>;

export const dictionaries: Record<AppLocale, TranslationDictionary> = {
  en,
  hi,
  mr,
  gu,
  te,
};
