export type RouteParamParseResult =
  | {
      kind: 'raw-id';
      raw: string;
      id: string;
      slug: '';
      shortSuffix: '';
    }
  | {
      kind: 'legacy-slug-id';
      raw: string;
      id: string;
      slug: string;
      shortSuffix: string;
    }
  | {
      kind: 'slug-short';
      raw: string;
      id: '';
      slug: string;
      shortSuffix: string;
    }
  | {
      kind: 'unknown';
      raw: string;
      id: '';
      slug: string;
      shortSuffix: '';
    };

export const UUID_PREFIX_SEGMENT_LENGTH = 13;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PREFIX_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}$/i;

export const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

export const isUuid = (value: string): boolean => UUID_REGEX.test(value.trim());

export const isUuidPrefix = (value: string): boolean => UUID_PREFIX_REGEX.test(value.trim());

export const getUuidPrefix = (id: string): string => {
  const normalizedId = id.trim().toLowerCase();
  if (isUuid(normalizedId)) {
    return normalizedId.split('-').slice(0, 2).join('-');
  }

  const compact = normalizedId.replace(/[^a-z0-9]/gi, '').slice(0, 12);
  if (!compact) {
    return '';
  }

  return compact.length > 8 ? `${compact.slice(0, 8)}-${compact.slice(8)}` : compact;
};

export const buildSlugSegments = (...values: Array<string | number | null | undefined>): string => {
  return values
    .map((value) => (value === null || value === undefined ? '' : slugify(String(value))))
    .filter(Boolean)
    .join('-');
};

export const buildSlugWithShortSuffix = (slug: string, id: string): string => {
  const normalizedSlug = slugify(slug);
  const suffix = getUuidPrefix(id);

  if (!normalizedSlug) {
    return suffix || id;
  }

  if (!suffix) {
    return normalizedSlug;
  }

  return `${normalizedSlug}-${suffix}`;
};

export const parseRouteParam = (rawValue: string): RouteParamParseResult => {
  const raw = rawValue.trim();

  if (!raw) {
    return {
      kind: 'unknown',
      raw,
      id: '',
      slug: '',
      shortSuffix: '',
    };
  }

  if (isUuid(raw)) {
    return {
      kind: 'raw-id',
      raw,
      id: raw,
      slug: '',
      shortSuffix: '',
    };
  }

  if (raw.includes('--')) {
    const segments = raw.split('--');
    const id = (segments[segments.length - 1] || '').trim();
    const slug = segments.slice(0, -1).join('--').trim();

    return {
      kind: 'legacy-slug-id',
      raw,
      id,
      slug,
      shortSuffix: getUuidPrefix(id),
    };
  }

  if (raw.length > UUID_PREFIX_SEGMENT_LENGTH) {
    const candidateSuffix = raw.slice(-UUID_PREFIX_SEGMENT_LENGTH);
    if (isUuidPrefix(candidateSuffix) && raw.charAt(raw.length - UUID_PREFIX_SEGMENT_LENGTH - 1) === '-') {
      return {
        kind: 'slug-short',
        raw,
        id: '',
        slug: raw.slice(0, raw.length - UUID_PREFIX_SEGMENT_LENGTH - 1).trim(),
        shortSuffix: candidateSuffix,
      };
    }
  }

  return {
    kind: 'unknown',
    raw,
    id: '',
    slug: raw,
    shortSuffix: '',
  };
};
