import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isLocalBrandingMediaUrl,
  saveBrandingImageLocally,
  resolveLocalBrandingFilePath,
} from './brandingStorage';

test('recognizes and safely resolves local branding URLs', async () => {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'jcb-branding-test-'));

  try {
    const localUrl = '/uploads/public/site-logo/site-logo-current.webp';
    assert.equal(isLocalBrandingMediaUrl(localUrl), true);
    assert.equal(
      resolveLocalBrandingFilePath(localUrl, storageRoot),
      path.join(storageRoot, 'site-logo', 'site-logo-current.webp'),
    );
    assert.equal(isLocalBrandingMediaUrl('/uploads/public/listings/machine.webp'), false);
    assert.equal(resolveLocalBrandingFilePath('/uploads/public/site-logo/../secret.webp', storageRoot), null);
    assert.equal(resolveLocalBrandingFilePath('/uploads/public/site-logo/%2e%2e/secret.webp', storageRoot), null);
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});

test('saves branding images in the local public purpose directory', async () => {
  const storageRoot = await mkdtemp(path.join(os.tmpdir(), 'jcb-branding-test-'));

  try {
    const saved = await saveBrandingImageLocally(
      Buffer.from('hero-bytes'),
      'hero.webp',
      'image/webp',
      'hero-image',
      storageRoot,
    );

    assert.match(saved.fileName, /^hero-image-[a-zA-Z0-9-]+\.webp$/);
    assert.equal(saved.fileUrl, `/uploads/public/hero-image/${saved.fileName}`);
    assert.deepEqual(await readFile(path.join(storageRoot, 'hero-image', saved.fileName)), Buffer.from('hero-bytes'));
  } finally {
    await rm(storageRoot, { recursive: true, force: true });
  }
});
