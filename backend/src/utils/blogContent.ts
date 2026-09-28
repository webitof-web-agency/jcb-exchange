const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'span',
  'a',
  'img',
]);

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const isSafeMediaUrl = (value: string) =>
  /^(?:https?:\/\/|\/uploads\/public\/)/i.test(value.trim());

const isSafeHref = (value: string) =>
  /^(?:https?:\/\/|mailto:|tel:|\/)/i.test(value.trim()) && !/^(?:javascript|data|vbscript):/i.test(value.trim());

const getAttribute = (attributes: string, name: string) => {
  const match = attributes.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match?.[1]?.trim() || '';
};

const unwrapAccidentalHeadingWrappers = (html: string) => html.replace(
  /<h([234])>([\s\S]*?)<\/h\1>/gi,
  (match, _level: string, innerHtml: string) => /<(?:p|h[1-6]|ul|ol|blockquote)\b/i.test(innerHtml)
    ? innerHtml
    : match,
);

export const normalizeBlogSlug = (value: string) => {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);

  if (!slug) {
    throw new Error('Blog slug cannot be empty.');
  }

  return slug;
};

export const sanitizeBlogHtml = (value: string) => {
  const source = String(value || '').trim();
  if (!source) {
    throw new Error('Blog content cannot be empty.');
  }

  const withoutDangerousBlocks = source
    .replace(/<!--(?:.|\n|\r)*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*>(?:.|\n|\r)*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form)\b[^>]*\/?>/gi, '');

  const sanitizedHtml = withoutDangerousBlocks.replace(/<\/?[a-z][^>]*>/gi, (tag) => {
    const closing = /^<\//.test(tag);
    const tagName = tag.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
    if (!tagName || !ALLOWED_TAGS.has(tagName)) return '';
    if (closing) return `</${tagName}>`;
    if (tagName === 'br') return '<br>';

    const attributes = tag.slice(tagName.length + 1, -1);
    if (tagName === 'a') {
      const href = getAttribute(attributes, 'href');
      if (!href || !isSafeHref(href)) return '<span>';
      return `<a href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer">`;
    }

    if (tagName === 'img') {
      const src = getAttribute(attributes, 'src');
      if (!src || !isSafeMediaUrl(src)) return '';
      const alt = getAttribute(attributes, 'alt');
      return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" loading="lazy">`;
    }

    if (tagName === 'span') {
      const style = getAttribute(attributes, 'style');
      const fontSize = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/i)?.[1];
      return fontSize ? `<span style="font-size:${fontSize}px">` : '<span>';
    }

    return `<${tagName}>`;
  }).trim();

  return unwrapAccidentalHeadingWrappers(sanitizedHtml).trim();
};
