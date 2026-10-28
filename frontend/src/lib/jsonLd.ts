const LINE_SEPARATOR = new RegExp(String.fromCharCode(0x2028), 'g');
const PARAGRAPH_SEPARATOR = new RegExp(String.fromCharCode(0x2029), 'g');

/**
 * Serializes structured data for a <script type="application/ld+json"> tag. Listing titles, dealer and job
 * descriptions come from users, so "</script>" or "<!--" inside them must not end the tag: every <, > and &
 * (plus the JS line separators) is written as a \u escape, which JSON parsers read back unchanged.
 */
export const serializeJsonLd = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEPARATOR, '\\u2028')
    .replace(PARAGRAPH_SEPARATOR, '\\u2029');
