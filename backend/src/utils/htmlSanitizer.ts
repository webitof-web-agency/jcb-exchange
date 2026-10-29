import sanitizeHtml from 'sanitize-html';

// Allow-list HTML cleaning for the few fields that legitimately hold markup (legal pages, blog articles,
// category icons). Everything else is plain text and goes through the request sanitizer instead.

/** Tags whose contents are dropped together with the tag, not kept as text. */
const DROP_WITH_CONTENT = ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed', 'form', 'title', 'head', 'template', 'select'];

const SAFE_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*[\d.\s,%]+\)$/i, /^[a-z]{3,20}$/i];

/** Legal pages (privacy, terms, disclaimer): the same tags, classes and styles the admin editor produces. */
export const sanitizeLegalHtml = (value: unknown) => sanitizeHtml(String(value ?? ''), {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'span', 'div'],
  allowedAttributes: { '*': ['class', 'style'] },
  allowedClasses: { '*': ['legal-callout'] },
  allowedStyles: {
    '*': {
      'font-size': [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/],
      'font-weight': [/^(?:normal|bold|bolder|lighter|[1-9]00)$/],
      'font-style': [/^(?:normal|italic)$/],
      'text-decoration': [/^[a-z -]{1,40}$/],
      color: SAFE_COLOR,
      'background-color': SAFE_COLOR,
    },
  },
  nonTextTags: DROP_WITH_CONTENT,
}).trim();

/**
 * First pass for blog articles: removes scripts, event handlers, comments and malformed markup with a real
 * HTML parser. The blog formatter then rebuilds each allowed tag in its fixed shape.
 */
export const sanitizeBlogMarkup = (value: unknown) => sanitizeHtml(String(value ?? ''), {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'span', 'a', 'img'],
  allowedAttributes: { a: ['href'], img: ['src', 'alt'], span: ['style'] },
  allowedStyles: { span: { 'font-size': [/^\d+(?:\.\d+)?px$/] } },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  nonTextTags: DROP_WITH_CONTENT,
});

const SVG_TAGS = ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'defs', 'title', 'desc', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'symbol'];
const SVG_ATTRIBUTES = [
  'xmlns', 'viewBox', 'viewbox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fill-rule', 'fill-opacity', 'clip-rule', 'clip-path', 'mask', 'opacity', 'transform', 'id', 'class',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity',
  'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'preserveAspectRatio', 'aria-hidden', 'role', 'focusable', 'version',
];

/** Category icons: drawing elements only. No scripts, event handlers, links, <use>, <image> or foreignObject. */
export const sanitizeSvg = (value: unknown) => {
  const cleaned = sanitizeHtml(String(value ?? ''), {
    allowedTags: SVG_TAGS,
    allowedAttributes: { '*': SVG_ATTRIBUTES },
    // url(#gradient) references stay; anything that could load or run something does not.
    exclusiveFilter: (frame) => Object.values(frame.attribs).some((attribute) => /javascript:|data:|url\(\s*['"]?(?!#)/i.test(attribute)),
    nonTextTags: [...DROP_WITH_CONTENT, 'foreignObject'],
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  }).trim();
  return /^<svg[\s>]/i.test(cleaned) ? cleaned : '';
};
