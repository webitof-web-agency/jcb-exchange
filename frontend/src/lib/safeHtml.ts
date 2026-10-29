import DOMPurify from 'dompurify';

// Last line of defence before dangerouslySetInnerHTML. The API already allow-lists this markup when it is saved
// and served; DOMPurify needs a DOM, so during server rendering the API-cleaned value is used as is.

/** Rich text (legal pages, blog articles, FAQ answers). */
export const purifyHtml = (html: string | null | undefined) => {
  const value = html ?? '';
  if (typeof window === 'undefined') return value;
  return DOMPurify.sanitize(value, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'] });
};

/** Inline SVG icons. */
export const purifySvg = (svg: string | null | undefined) => {
  const value = svg ?? '';
  if (typeof window === 'undefined') return value;
  return DOMPurify.sanitize(value, { USE_PROFILES: { svg: true }, FORBID_TAGS: ['use', 'image', 'foreignObject', 'a'] });
};
