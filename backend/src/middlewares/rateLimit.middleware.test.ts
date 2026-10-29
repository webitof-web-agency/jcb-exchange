import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createRateLimiter } from './rateLimit.middleware';

const fakeResponse = () => {
  const response = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown };
  const res = {
    setHeader: (key: string, value: string) => { response.headers[key] = value; },
    status: (code: number) => { response.statusCode = code; return res; },
    json: (body: unknown) => { response.body = body; return res; },
  } as unknown as Response;
  return { res, response };
};

const call = (limiter: ReturnType<typeof createRateLimiter>, ip: string) => {
  const { res, response } = fakeResponse();
  let passed = false;
  limiter({ ip } as Request, res, (() => { passed = true; }) as NextFunction);
  return { passed, response };
};

test('allows up to the limit, then answers 429 with Retry-After', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3, message: 'Slow down.' });
  for (let attempt = 1; attempt <= 3; attempt += 1) assert.ok(call(limiter, '1.1.1.1').passed);
  const blocked = call(limiter, '1.1.1.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.response.statusCode, 429);
  assert.deepEqual(blocked.response.body, { error: 'Slow down.' });
  assert.ok(Number(blocked.response.headers['Retry-After']) > 0);
});

test('counts each IP and each limiter separately', () => {
  const login = createRateLimiter({ windowMs: 60_000, max: 1 });
  const leads = createRateLimiter({ windowMs: 60_000, max: 1 });
  assert.ok(call(login, '2.2.2.2').passed);
  assert.equal(call(login, '2.2.2.2').passed, false);
  assert.ok(call(login, '3.3.3.3').passed);
  assert.ok(call(leads, '2.2.2.2').passed);
});

test('the window resets', async () => {
  const limiter = createRateLimiter({ windowMs: 20, max: 1 });
  assert.ok(call(limiter, '4.4.4.4').passed);
  assert.equal(call(limiter, '4.4.4.4').passed, false);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(call(limiter, '4.4.4.4').passed);
});
