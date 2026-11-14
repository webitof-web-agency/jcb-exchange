import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const testRoots = [resolve(process.cwd(), 'src'), resolve(process.cwd(), 'test')];
const testFiles = [];

process.env.NEXT_PUBLIC_API_URL ||= 'http://127.0.0.1:5002/api';

async function collectTests(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectTests(entryPath);
    } else if (entry.isFile() && /\.test\.(mjs|ts)$/.test(entry.name)) {
      testFiles.push(entryPath);
    }
  }
}

for (const root of testRoots) {
  await collectTests(root);
}
testFiles.sort();

const child = spawn(process.execPath, ['--import', 'tsx', '--test', ...testFiles], {
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
});
