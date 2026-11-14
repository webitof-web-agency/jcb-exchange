import assert from 'node:assert/strict';
import test from 'node:test';
import { isOutsideInteractiveRegion, shouldDismissDropdown } from './dropdownInteractions';

test('keeps an open dropdown when the pointer is inside its interactive region', () => {
  const region = { contains: (target: unknown) => target === 'menu-item' };

  assert.equal(isOutsideInteractiveRegion(region, 'menu-item'), false);
});

test('closes an open dropdown when the pointer is outside its interactive region', () => {
  const region = { contains: (target: unknown) => target === 'menu-item' };

  assert.equal(isOutsideInteractiveRegion(region, 'page-content'), true);
});

test('dismisses the dropdown for outside click and touch interactions', () => {
  const region = { contains: (target: unknown) => target === 'menu-item' };

  assert.equal(shouldDismissDropdown(region, 'page-content', 'click'), true);
  assert.equal(shouldDismissDropdown(region, 'page-content', 'touchstart'), true);
  assert.equal(shouldDismissDropdown(region, 'menu-item', 'click'), false);
});
