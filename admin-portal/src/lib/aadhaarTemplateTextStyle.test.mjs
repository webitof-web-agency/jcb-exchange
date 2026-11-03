import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const componentPath = fileURLToPath(new URL('../components/identityHub/AadhaarTemplatePreview.tsx', import.meta.url));

test('marked Aadhaar address and card fields use regular text rendering', async () => {
  const source = await readFile(componentPath, 'utf8');

  assert.match(source, /fitAndDrawRegular\(ctx, fullName, FIELD\.toName/);
  assert.match(source, /fitAndDrawRegular\(ctx, careOf, FIELD\.careOf/);
  assert.match(source, /fitAndDrawRegular\(ctx, hNo, FIELD\.hNo/);
  assert.match(source, /fitAndDrawRegular\(ctx, vtc, FIELD\.vtc/);
  assert.match(source, /fitAndDrawRegular\(ctx, fullName, FIELD\.cardName/);
  assert.match(source, /fitAndDrawRegular\(ctx, dob, FIELD\.cardDob/);
  assert.match(source, /fitAndDrawRegular\(ctx, gender, FIELD\.cardGender/);
  assert.match(source, /ctx\.font = 'normal 38px Arial, sans-serif'/);
  assert.match(source, /cardDob:\s*\{ x: 495, y: 1883, maxWidth: 285 \}/);
  assert.match(source, /getCenteredTextStartX\(\s*FIELD\.topAadhaar\.x/);
  assert.match(source, /ctx\.fillText\(`VID : \$\{vid\}`, topAadhaarStartX/);
  assert.match(source, /getCenteredTextStartX\(\s*FIELD\.backAadhaar\.x/);
  assert.match(source, /ctx\.fillText\(`VID : \$\{vid\}`, backAadhaarStartX/);
  assert.match(source, /topVidWhiteout:\s*\{ x: 250, y: 1618, width: 500, height: 35 \}/);
  assert.match(source, /topVidSeparator:\s*\{ x1: 300, y: 1618, x2: 620 \}/);
  assert.match(source, /fitAndDrawRegular\(ctx, enrolmentNo, FIELD\.enrolmentNo\.x, FIELD\.enrolmentNo\.y, FIELD\.enrolmentNo\.maxWidth, 20, 15\)/);
  assert.match(source, /backDividerLine:\s*\{ x1: 907, y: 2166, x2: 1681 \}/);
  assert.match(source, /ctx\.fillRect\(\s*FIELD\.backDividerLine\.x1,\s*FIELD\.backDividerLine\.y,\s*FIELD\.backDividerLine\.x2 - FIELD\.backDividerLine\.x1,\s*2,?\s*\)/);
});

test('places the top-letter QR at the marked horizontal end point', async () => {
  const source = await readFile(componentPath, 'utf8');

  assert.match(source, /letterQr:\s*\{ x: 620, y: 1260, size: 210 \}/);
});
