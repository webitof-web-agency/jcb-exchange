import { useCallback } from 'react';
import { DEFAULT_LOCALE } from '@/lib/i18n/config';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { queueMissingTranslationRegistration } from '@/lib/i18n/missingTranslationRegistry';
import { useLanguageStore } from '@/store/languageStore';

type TranslationValue = string | number | boolean | null | undefined;
export type TranslationParams = Record<string, TranslationValue>;
type TranslationDefaultText = string;

const isTranslationParams = (value: unknown): value is TranslationParams =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const getNestedValue = (dictionary: unknown, key: string): string | null => {
  const value = key.split('.').reduce<unknown>((currentValue, segment) => {
    if (!currentValue || typeof currentValue !== 'object') {
      return null;
    }

    return (currentValue as Record<string, unknown>)[segment];
  }, dictionary);

  return typeof value === 'string' ? value : null;
};

const interpolate = (template: string, params?: TranslationParams) => {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(params[token] ?? `{${token}}`));
};

const buildRegistryFallbackText = (key: string, defaultText?: string) => {
  if (defaultText?.trim()) {
    return defaultText.trim();
  }

  const lastSegment = key.split('.').filter(Boolean).pop() ?? key;
  const normalizedLabel = lastSegment
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();

  return normalizedLabel
    ? normalizedLabel.charAt(0).toUpperCase() + normalizedLabel.slice(1)
    : key;
};

const resolveTranslationArguments = (
  secondArgument?: TranslationParams | TranslationDefaultText,
  thirdArgument?: TranslationParams,
) => {
  if (typeof secondArgument === 'string') {
    return {
      defaultText: secondArgument,
      params: thirdArgument,
    };
  }

  return {
    defaultText: undefined,
    params: isTranslationParams(secondArgument) ? secondArgument : undefined,
  };
};

export const useTranslation = () => {
  const locale = useLanguageStore((state) => state.locale);
  const translationOverrides = useLanguageStore((state) => state.translationOverrides);

  type TranslationFunction = {
    (key: string, params?: TranslationParams): string;
    (key: string, defaultText: TranslationDefaultText, params?: TranslationParams): string;
  };

  const t = useCallback(function translate(
      key: string,
      secondArgument?: TranslationParams | TranslationDefaultText,
      thirdArgument?: TranslationParams,
    ) {
      const { defaultText, params } = resolveTranslationArguments(secondArgument, thirdArgument);
      const overrideValue = translationOverrides[locale]?.[key] ?? null;
      const localizedValue = getNestedValue(dictionaries[locale], key);
      const fallbackValue = getNestedValue(dictionaries[DEFAULT_LOCALE], key);

      if (!overrideValue && !localizedValue && !fallbackValue) {
        queueMissingTranslationRegistration(
          'admin-portal',
          key,
          buildRegistryFallbackText(key, defaultText),
        );
      }

      const resolved = overrideValue ?? localizedValue ?? fallbackValue ?? defaultText ?? key;

      return interpolate(resolved, params);
    }, [locale, translationOverrides]) as TranslationFunction;

  return {
    locale,
    t,
  };
};
