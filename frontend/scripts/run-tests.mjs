import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.cwd(), 'src');
const testFiles = [];

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectTests(entryPath);
    } else if (entry.isFile() && entry.name.endsWith('.test.mjs')) {
      testFiles.push(entryPath);
    }
  }
}

await collectTests(root);
testFiles.sort();

const child = spawn(process.execPath, ['--test', ...testFiles], { stdio: 'inherit', shell: false });

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
});
