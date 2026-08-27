import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const readDotEnv = () => {
  const envPath = resolve(rootDir, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const [key, ...valueParts] = line.split('=');
        return [key.trim(), valueParts.join('=').trim().replace(/^["']|["']$/g, '')];
      })
  );
};

const envFile = readDotEnv();
const port = process.env.PORT || process.env.FRONTEND_PORT || envFile.FRONTEND_PORT || '3001';
const host = process.env.HOSTNAME || 'localhost';

const canListen = (targetPort) =>
  new Promise((resolvePortCheck) => {
    const server = createServer();

    server.once('error', (error) => {
      resolvePortCheck(error.code !== 'EADDRINUSE');
    });

    server.once('listening', () => {
      server.close(() => resolvePortCheck(true));
    });

    server.listen(Number(targetPort));
  });

const checkExistingApp = (targetPort) =>
  new Promise((resolveCheck) => {
    const req = request(
      {
        host: 'localhost',
        port: Number(targetPort),
        path: '/login',
        method: 'GET',
        timeout: 2500,
      },
      (res) => {
        res.resume();
        resolveCheck(res.statusCode && res.statusCode < 500);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolveCheck(false);
    });
    req.on('error', () => resolveCheck(false));
    req.end();
  });

if (!(await canListen(port))) {
  if (await checkExistingApp(port)) {
    console.log(`Frontend is already running at http://${host}:${port}`);
    console.log('Use the existing browser tab, or stop that server before starting a new one.');
    process.exit(0);
  }

  console.error(`Port ${port} is already in use by another process.`);
  console.error('Stop that process or set FRONTEND_PORT/PORT to a free port.');
  process.exit(1);
}

const child = spawn('next', ['dev', '-p', port], {
  cwd: rootDir,
  env: { ...process.env, PORT: port },
  shell: true,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
