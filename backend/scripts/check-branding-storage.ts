import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { publicUploadDir, storageBaseDir } from '../src/utils/documentUpload';

const brandingDirectories = [
  'finance-support',
  'hero-image',
  'inspection-section',
  'site-logo',
  'site-dark-logo',
  'site-favicon',
  'site-manifest-icon',
];

const main = async () => {
  await mkdir(publicUploadDir, { recursive: true });
  await Promise.all(
    brandingDirectories.map((directory) => mkdir(path.join(publicUploadDir, directory), { recursive: true })),
  );

  await access(publicUploadDir);
  console.log(JSON.stringify({ storageBaseDir, publicUploadDir, ready: true }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
