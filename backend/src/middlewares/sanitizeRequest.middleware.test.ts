import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { sanitizeInput, sanitizePlainText, sanitizeRequest } from './sanitizeRequest.middleware';

test('plain text loses tags, scripts and control characters but keeps ordinary text', () => {
  assert.equal(sanitizePlainText('  <b>Ramesh</b> Sahu  '), 'Ramesh Sahu');
  assert.equal(sanitizePlainText('Hi<script>alert(1)</script> there'), 'Hi there');
  assert.equal(sanitizePlainText('<img src=x onerror=alert(1)>Raipur'), 'Raipur');
  assert.equal(sanitizePlainText('x<svg/onload=alert(1)'), 'xsvg/onload=alert(1)');
  assert.equal(sanitizePlainText('note <!-- hidden --> end'), 'note end');
  assert.equal(sanitizePlainText('price < 5 lakh, a<3, 2<4'), 'price < 5 lakh, a<3, 2<4');
  assert.equal(sanitizePlainText('Line 1\nLine 2\tTab'), 'Line 1\nLine 2\tTab');
  assert.equal(sanitizePlainText('JCB Exchange <noreply@jcbexchange.com>'), 'JCB Exchange <noreply@jcbexchange.com>');
  assert.equal(sanitizePlainText(`Bad${String.fromCharCode(0)}null${String.fromCharCode(0x202e)}rtl`), 'Badnullrtl');
});

test('Hindi text, joiners and emoji survive', () => {
  const hindi = 'क्षेत्र – राम्‍ ✅ 👍';
  assert.equal(sanitizePlainText(hindi), hindi.normalize('NFC'));
});

test('passwords, OTPs, tokens and markup fields are left for their own handling', () => {
  const body = sanitizeInput({
    password: '  <p@ss> ', newPassword: ' x ', otp: ' 1234 ', idToken: 'a<b>c', razorpay_signature: ' sig ',
    contentHtml: '<p>keep</p>', legalPages: { privacyPolicy: '<h2>keep</h2>' }, svgData: '<svg></svg>',
  }) as Record<string, any>;
  assert.equal(body.password, '  <p@ss> ');
  assert.equal(body.newPassword, ' x ');
  assert.equal(body.otp, ' 1234 ');
  assert.equal(body.idToken, 'a<b>c');
  assert.equal(body.razorpay_signature, ' sig ');
  assert.equal(body.contentHtml, '<p>keep</p>');
  assert.equal(body.legalPages.privacyPolicy, '<h2>keep</h2>');
  assert.equal(body.svgData, '<svg></svg>');
});

test('nested objects and arrays are cleaned; prototype keys are dropped; other types kept', () => {
  const input = JSON.parse('{"name":" <i>A</i> ","items":[{"note":"<b>x</b>"}," y "],"__proto__":{"admin":true},"amount":10,"ok":true,"none":null}');
  const body = sanitizeInput(input) as Record<string, any>;
  assert.deepEqual(body, { name: 'A', items: [{ note: 'x' }, 'y'], amount: 10, ok: true, none: null });
  assert.equal(({} as Record<string, unknown>).admin, undefined);
});

test('middleware cleans body and pins a cleaned query on Express 5 requests', () => {
  const proto = { get query() { return { q: ' <b>jcb</b> ', page: '2' }; } };
  const req = Object.create(proto) as Request;
  req.body = { title: ' <script>x</script>Loader ' };
  let called = false;
  sanitizeRequest(req, {} as Response, (() => { called = true; }) as NextFunction);
  assert.ok(called);
  assert.deepEqual(req.body, { title: 'Loader' });
  assert.deepEqual(req.query, { q: 'jcb', page: '2' });
});

test('works inside a real Express 5 app (JSON body and query string)', async () => {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use(sanitizeRequest);
  app.post('/echo', (req, res) => { res.json({ body: req.body, query: req.query }); });
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/echo?q=%3Cb%3Ejcb%3C%2Fb%3E&tags=a&tags=%3Ci%3Eb%3C%2Fi%3E`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ' <script>alert(1)</script>Ramesh ', password: ' keep ' }),
    });
    assert.deepEqual(await response.json(), { body: { name: 'Ramesh', password: ' keep ' }, query: { q: 'jcb', tags: ['a', 'b'] } });
  } finally {
    server.close();
  }
});
