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

/** Strict output policy for the internal AI response surface. */
export const purifyAiHtml = (html: string | null | undefined) => {
  const value = (html ?? '').replace(/\r\n?/g, '\n').replace(/\n/g, '<br />');
  if (typeof window === 'undefined') {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'h1', 'h2', 'h3', 'blockquote'],
    ALLOWED_ATTR: [],
  });
};
