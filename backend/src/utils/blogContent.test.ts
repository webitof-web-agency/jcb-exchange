import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBlogSlug, sanitizeBlogHtml } from './blogContent';

test('normalizes blog slugs for stable public URLs', () => {
  assert.equal(normalizeBlogSlug('  Heavy Machinery Buying Guide!  '), 'heavy-machinery-buying-guide');
  assert.equal(normalizeBlogSlug('JCB 3DX — 2026'), 'jcb-3dx-2026');
});

test('removes unsafe blog markup while preserving supported rich text', () => {
  const sanitized = sanitizeBlogHtml(
    '<h2>Safe heading</h2><p onclick="alert(1)">Useful <strong>content</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
  );

  assert.match(sanitized, /<h2>Safe heading<\/h2>/);
  assert.match(sanitized, /<strong>content<\/strong>/);
  assert.match(sanitizeBlogHtml('<p><span style="font-size:24px;color:red">Large text</span></p>'), /<span style="font-size:24px">Large text<\/span>/);
  assert.doesNotMatch(sanitized, /<script|onclick|javascript:/i);
});

test('unwraps malformed block-level content from accidental heading wrappers', () => {
  const sanitized = sanitizeBlogHtml(
    '<h2><p><strong>Content:</strong></p><p><i>Only this paragraph is italic.</i></p><p>This paragraph is normal.</p></h2>',
  );

  assert.doesNotMatch(sanitized, /^<h2>/i);
  assert.match(sanitized, /<strong>Content:<\/strong>/);
  assert.match(sanitized, /<i>Only this paragraph is italic\.<\/i>/);
  assert.match(sanitized, /<p>This paragraph is normal\.<\/p>/);
});

test('rejects an empty blog title or content payload', () => {
  assert.throws(() => normalizeBlogSlug(''), /cannot be empty/i);
  assert.throws(() => sanitizeBlogHtml('   '), /content cannot be empty/i);
});
