import assert from 'node:assert/strict';
import test from 'node:test';
import { replaceBlogImageSources } from './blogMediaMigration';

test('replaces every blog image source through the supplied media migrator', async () => {
  const migratedSources: string[] = [];
  const migratedHtml = await replaceBlogImageSources(
    '<p>Intro</p><img src="/uploads/public/blog-cover/old-cover.webp" alt="Cover"><p><img src="https://drive.google.com/uc?id=already-on-drive" loading="lazy"></p>',
    async (source) => {
      migratedSources.push(source);
      return source.startsWith('/uploads/')
        ? 'https://drive.google.com/uc?id=migrated-drive-file-id'
        : source;
    },
  );

  assert.equal(
    migratedHtml,
    '<p>Intro</p><img src="https://drive.google.com/uc?id=migrated-drive-file-id" alt="Cover"><p><img src="https://drive.google.com/uc?id=already-on-drive" loading="lazy"></p>',
  );
  assert.deepEqual(migratedSources, [
    '/uploads/public/blog-cover/old-cover.webp',
    'https://drive.google.com/uc?id=already-on-drive',
  ]);
});

test('leaves HTML without image sources unchanged', async () => {
  const html = '<h2>Road construction guide</h2><p>Useful content.</p>';
  assert.equal(await replaceBlogImageSources(html, async (source) => source), html);
});
