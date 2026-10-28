import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeLegalHtml, sanitizeSvg } from './htmlSanitizer';
import { sanitizeBlogHtml } from './blogContent';

test('legal pages keep editor formatting and drop scripts and handlers', () => {
  const html = '<h2>Terms</h2><div class="legal-callout other" onclick="x()"><p style="color:#b45309;position:fixed">Note</p></div>'
    + '<script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a>';
  const clean = sanitizeLegalHtml(html);
  assert.equal(clean, '<h2>Terms</h2><div class="legal-callout"><p style="color:#b45309">Note</p></div>link');
});

test('legal pages: empty input stays empty', () => {
  assert.equal(sanitizeLegalHtml(null), '');
});

test('blog keeps its output shape and resists parser tricks', () => {
  assert.equal(sanitizeBlogHtml('<p>A &amp; B<br/></p>'), '<p>A &amp; B<br></p>');
  assert.equal(sanitizeBlogHtml('<p><a href="https://x.com/?a=1&b=2">go</a></p>'), '<p><a href="https://x.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">go</a></p>');
  for (const payload of [
    '<a href="jav&#x61;script:alert(1)">x</a>',
    '<a href="  javascript:alert(1)">x</a>',
    '<img src="x" onerror="alert(1)">',
    '<svg onload=alert(1)>',
    '<p>ok</p><!--<img src=x onerror=alert(1)>-->',
    '<scr<script>ipt>alert(1)</script>',
    '<p title="</p><img src=x onerror=alert(1)>">t</p>',
  ]) {
    const clean = sanitizeBlogHtml(`<p>start</p>${payload}`);
    assert.ok(!/onerror|onload|javascript:|<script|<svg/i.test(clean), `${payload} -> ${clean}`);
  }
});

test('SVG icons keep drawing markup only', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><path d="M1 1h22" stroke="currentColor"/>'
    + '<script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="javascript:alert(1)"><circle r="2"/></a>'
    + '<rect width="4" height="4" fill="url(https://evil.example/x)"/><use href="#x"/></svg>';
  const clean = sanitizeSvg(svg);
  assert.match(clean, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24">/);
  assert.match(clean, /<path d="M1 1h22" stroke="currentColor"><\/path><circle r="2"><\/circle><\/svg>$/);
  assert.ok(!/onload|script|foreignObject|javascript|evil|<use|<a/i.test(clean), clean);
  assert.equal(sanitizeSvg('<img src=x onerror=alert(1)>'), '');
  assert.equal(sanitizeSvg('not an svg'), '');
});
