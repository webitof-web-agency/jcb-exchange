import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./Navbar.tsx', import.meta.url), 'utf8');

test('keeps the mobile menu trigger and drawer on the same breakpoint at 1024px', () => {
  const mobileMenuSection = source.slice(source.indexOf('{/* Mobile Menu Backdrop Overlay */}'));

  assert.match(mobileMenuSection, /Mobile Menu Backdrop Overlay[\s\S]*?className="[^"]*xl:hidden/);
  assert.match(mobileMenuSection, /Mobile Slide-Over Navigation Drawer[\s\S]*?className={`[^}]*xl:hidden/);
  assert.doesNotMatch(mobileMenuSection, /Mobile Menu Backdrop Overlay[\s\S]*?className="[^"]*lg:hidden/);
  assert.doesNotMatch(mobileMenuSection, /Mobile Slide-Over Navigation Drawer[\s\S]*?className={`[^}]*lg:hidden/);
});

test('exposes the mobile menu state to assistive technology', () => {
  assert.match(source, /aria-expanded=\{isMobileMenuOpen\}/);
  assert.match(source, /aria-controls="mobile-navigation-drawer"/);
  assert.match(source, /id="mobile-navigation-drawer"/);
});
