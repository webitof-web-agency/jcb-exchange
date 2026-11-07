import test from 'node:test';
import assert from 'node:assert/strict';

function filterSearchableOptions(options, query) {
  const clean = String(query ?? '').trim().toLowerCase();
  if (!clean) return options;
  return options.filter((opt) => String(opt.name ?? '').toLowerCase().includes(clean));
}

function calculateMenuGeometry({
  buttonRect,
  viewportWidth,
  viewportHeight,
  containerRect = null,
  minMenuWidth = 240,
  align = 'auto',
}) {
  const spaceBelow = viewportHeight - buttonRect.bottom;
  const spaceAbove = buttonRect.top;
  const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableSpace = openUp ? spaceAbove - 16 : spaceBelow - 16;
  const maxHeight = Math.max(140, Math.min(280, availableSpace));

  const boundaryLeft = containerRect ? Math.max(8, containerRect.left + 8) : 8;
  const boundaryRight = containerRect ? Math.min(viewportWidth - 8, containerRect.right - 8) : viewportWidth - 8;
  const availableContainerWidth = Math.max(160, boundaryRight - boundaryLeft);

  const targetWidth = Math.max(minMenuWidth, buttonRect.width);
  const menuWidth = Math.min(targetWidth, availableContainerWidth);

  const top = openUp ? buttonRect.top - maxHeight - 6 : buttonRect.bottom + 6;

  const shouldAlignRight =
    align === 'right' ||
    (align !== 'left' && buttonRect.left + menuWidth > boundaryRight);

  let left = shouldAlignRight ? buttonRect.right - menuWidth : buttonRect.left;

  if (left + menuWidth > boundaryRight) {
    left = boundaryRight - menuWidth;
  }
  if (left < boundaryLeft) {
    left = boundaryLeft;
  }

  return { top, left, width: menuWidth, maxHeight, openUp };
}

test('filterSearchableOptions filters states and cities correctly with casing and whitespace', () => {
  const states = [
    { id: 1, name: 'Andhra Pradesh' },
    { id: 2, name: 'Chhattisgarh' },
    { id: 3, name: 'Maharashtra' },
    { id: 4, name: 'Madhya Pradesh' },
  ];

  assert.equal(filterSearchableOptions(states, '  pradesh ').length, 2);
  assert.equal(filterSearchableOptions(states, 'chhat')[0].name, 'Chhattisgarh');
  assert.equal(filterSearchableOptions(states, 'xyz').length, 0);
  assert.equal(filterSearchableOptions(states, '').length, 4);
});

test('calculateMenuGeometry keeps dropdown strictly inside the modal card boundaries', () => {
  // Modal card in center of screen: left=500, right=920 (width 420px)
  const modalContainer = { left: 500, right: 920, top: 100, bottom: 700 };

  // City button is at the right edge of form inside modal: left=770, right=882, width=112
  const cityGeometry = calculateMenuGeometry({
    buttonRect: { top: 320, bottom: 364, left: 770, right: 882, width: 112 },
    viewportWidth: 1920,
    viewportHeight: 1080,
    containerRect: modalContainer,
    minMenuWidth: 240,
    align: 'right',
  });

  // Must not spill past modal right edge (920 - 8 = 912)
  assert.ok(cityGeometry.left + cityGeometry.width <= modalContainer.right - 8,
    `Menu right (${cityGeometry.left + cityGeometry.width}) must be <= modal right (${modalContainer.right - 8})`);

  // Must not spill before modal left edge (500 + 8 = 508)
  assert.ok(cityGeometry.left >= modalContainer.left + 8,
    `Menu left (${cityGeometry.left}) must be >= modal left (${modalContainer.left + 8})`);

  // Its right edge should match the right edge of City button (882)
  assert.equal(cityGeometry.left + cityGeometry.width, 882);
});
