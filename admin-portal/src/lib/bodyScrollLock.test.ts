import assert from 'node:assert/strict';
import test from 'node:test';
import { createScrollLock } from './bodyScrollLock';

const makeTarget = (overflow = '') => ({ style: { overflow } });

test('one dialog locks the page and gives back exactly what was there', () => {
  const target = makeTarget('auto');
  const lock = createScrollLock(() => target);
  const release = lock.acquire();
  assert.equal(target.style.overflow, 'hidden');
  release();
  assert.equal(target.style.overflow, 'auto');
  assert.equal(lock.holders(), 0);
});

test('stacked dialogs keep the page locked until the last one closes, whatever the closing order', () => {
  const target = makeTarget('');
  const lock = createScrollLock(() => target);
  const outer = lock.acquire();
  const inner = lock.acquire();
  inner();
  assert.equal(target.style.overflow, 'hidden');
  outer();
  assert.equal(target.style.overflow, '');

  const first = lock.acquire();
  const second = lock.acquire();
  first();
  assert.equal(target.style.overflow, 'hidden');
  second();
  assert.equal(target.style.overflow, '');
});

test('giving a lock back twice does not unlock the page under another dialog', () => {
  const target = makeTarget('');
  const lock = createScrollLock(() => target);
  const a = lock.acquire();
  const b = lock.acquire();
  a();
  a();
  assert.equal(lock.holders(), 1);
  assert.equal(target.style.overflow, 'hidden');
  b();
  assert.equal(target.style.overflow, '');
});

test('without a page (server rendering) nothing is touched and nothing throws', () => {
  const lock = createScrollLock(() => null);
  const release = lock.acquire();
  release();
  assert.equal(lock.holders(), 0);
});
