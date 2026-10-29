import assert from 'node:assert/strict';
import test from 'node:test';
import { caretAfterEdit, resolveSanitizeKind, sanitizeFieldValue, SANITIZE_KINDS, type SanitizeKind } from './formSanitizers';

const s = (kind: SanitizeKind, value: string, finalize = false) => sanitizeFieldValue(kind, value, finalize);

test('plain text: markup, control characters and repeated spaces go; the typing space stays', () => {
  assert.equal(s('text', '  <b>Ramesh</b>  Sahu '), 'Ramesh Sahu ');
  assert.equal(s('text', '  <b>Ramesh</b>  Sahu ', true), 'Ramesh Sahu');
  assert.equal(s('text', 'Hi<script>alert(1)</script>there'), 'Hithere');
  assert.equal(s('text', 'line1\nline2'), 'line1 line2');
  assert.equal(s('text', `a${String.fromCharCode(0)}b${String.fromCharCode(0x202e)}c`), 'abc');
  assert.equal(s('text', 'price < 5 lakh, a<3'), 'price < 5 lakh, a<3');
  assert.equal(s('text', 'x<svg onload=1'), 'xsvg onload=1');
});

test('multiline keeps line breaks and Hindi joiners', () => {
  const hindi = `पता: रायपुर${String.fromCharCode(0x200d)}\nछत्तीसगढ़`;
  assert.equal(s('multiline', `${hindi}<img src=x onerror=1>`), hindi);
  assert.equal(s('multiline', '  a\r\nb  ', true), 'a\nb');
});

test('contact fields', () => {
  assert.equal(s('email', ' Ramesh.Sahu+1@Gmail.COM '), 'ramesh.sahu+1@gmail.com');
  assert.equal(s('tel', '+91 98765-43210abc'), '+91 98765-43210');
  assert.equal(s('mobile', '+91 98765 43210'), '9876543210');
  assert.equal(s('mobile', '09876543210'), '9876543210');
  assert.equal(s('mobile', '98765abc432109999'), '9876543210');
  assert.equal(s('url', ' https://x.com/a b '), 'https://x.com/ab');
});

test('identity, bank and vehicle codes', () => {
  assert.equal(s('pan', 'abcde 1234f!x'), 'ABCDE1234F');
  assert.equal(s('gstin', '22abcde1234f1z5extra'), '22ABCDE1234F1Z5');
  assert.equal(s('ifsc', 'sbin 0001234'), 'SBIN0001234');
  assert.equal(s('aadhaar', '1234 5678 9012 34'), '123456789012');
  assert.equal(s('account', '0012-3456-7890'), '001234567890');
  assert.equal(s('pincode', '492 001x'), '492001');
  assert.equal(s('vehicle', 'cg 04 dm-1005'), 'CG04DM1005');
  assert.equal(s('chassis', 'mat 448/2x <b>'), 'MAT448/2X');
  assert.equal(s('engine', 'eng-x 20005'), 'ENG-X20005');
  assert.equal(s('code', 'jcbx/sv/2026-27/0001'), 'JCBX/SV/2026-27/0001');
  assert.equal(s('upi', 'Ramesh.Sahu @ OKSBI'), 'ramesh.sahu@oksbi');
});

test('names and numbers', () => {
  assert.equal(s('name', "Dr. R'amesh  Kumar-Sahu 123 @#"), "Dr. R'amesh Kumar-Sahu ");
  assert.equal(s('name', 'रमेश  साहू'), 'रमेश साहू');
  assert.equal(s('numeric', '1,25,000 abc'), '1,25,000 ');
  assert.equal(s('decimal', '1,25,000.5.0x'), '1,25,000.50');
  assert.equal(s('digits', 'a1b2'), '12');
  assert.equal(s('off', ' <b>raw</b> '), ' <b>raw</b> ');
});

test('every rule is idempotent', () => {
  const samples = ['  <b>Ab</b>  c ', '+91 98765 43210', 'cg04 dm 1005', 'x@Y.com ', '1,2.3.4', 'रमेश  साहू\nलाइन'];
  for (const kind of SANITIZE_KINDS) {
    for (const sample of samples) {
      for (const finalize of [false, true]) {
        const once = s(kind, sample, finalize);
        assert.equal(s(kind, once, finalize), once, `${kind} not idempotent for ${JSON.stringify(sample)}`);
      }
    }
  }
});

test('rule selection', () => {
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'text', explicit: 'PAN' }), 'pan');
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'text', explicit: 'unknown' }), 'text');
  assert.equal(resolveSanitizeKind({ tagName: 'TEXTAREA' }), 'multiline');
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'email' }), 'email');
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'text', inputMode: 'decimal' }), 'decimal');
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'password' }), null);
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'number' }), null);
  assert.equal(resolveSanitizeKind({ tagName: 'INPUT', type: 'date' }), null);
  assert.equal(resolveSanitizeKind({ tagName: 'SELECT' }), null);
});

test('cursor position after cleanup', () => {
  assert.equal(caretAfterEdit('Ra<mesh Sahu', 'Ramesh Sahu', 3), 2);
  assert.equal(caretAfterEdit('cg04', 'CG04', 4), 4);
  assert.equal(caretAfterEdit('  ab', 'ab', 4), 2);
  assert.equal(caretAfterEdit('abXcd', 'abXc', 3), 3);
  assert.equal(caretAfterEdit('98765x43210', '9876543210', 6), 5);
});
