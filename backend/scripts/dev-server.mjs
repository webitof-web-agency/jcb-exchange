import { existsSync, readFileSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = resolve(rootDir, 'runtime');
const pidFilePath = resolve(runtimeDir, 'backend-dev-server.json');
const command = process.argv[2] || 'start';

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
const port = process.env.PORT || envFile.PORT || '5000';
const host = process.env.HOSTNAME || 'localhost';

const ensureRuntimeDir = () => {
  mkdirSync(runtimeDir, { recursive: true });
};

const readPidFile = () => {
  if (!existsSync(pidFilePath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(pidFilePath, 'utf8'));
  } catch {
    return null;
  }
};

const writePidFile = (pid) => {
  ensureRuntimeDir();
  writeFileSync(
    pidFilePath,
    JSON.stringify(
      {
        pid,
        port: Number(port),
        startedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
};

const clearPidFile = () => {
  if (existsSync(pidFilePath)) {
    unlinkSync(pidFilePath);
  }
};

const isProcessRunning = (pid) => {
  if (!pid || typeof pid !== 'number') {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

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

const checkExistingApi = (targetPort) =>
  new Promise((resolveCheck) => {
    const req = request(
      {
        host: 'localhost',
        port: Number(targetPort),
        path: '/api/auth/setup-status',
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

const stopManagedServer = async () => {
  const pidRecord = readPidFile();

  if (!pidRecord?.pid) {
    console.log('No managed backend dev server record was found.');
    return;
  }

  if (!isProcessRunning(pidRecord.pid)) {
    clearPidFile();
    console.log('Removed stale backend dev server record.');
    return;
  }

  try {
    process.kill(pidRecord.pid, 'SIGTERM');
    clearPidFile();
    console.log(`Stopped managed backend dev server on port ${pidRecord.port} (PID ${pidRecord.pid}).`);
  } catch (error) {
    console.error(`Could not stop managed backend dev server PID ${pidRecord.pid}.`);
    console.error(error);
    process.exit(1);
  }
};

const printManagedStatus = async () => {
  const pidRecord = readPidFile();
  const apiRunning = await checkExistingApi(port);

  if (pidRecord?.pid && isProcessRunning(pidRecord.pid)) {
    console.log(
      `Managed backend dev server is running at http://${host}:${pidRecord.port} (PID ${pidRecord.pid}).`
    );
    return;
  }

  if (pidRecord?.pid) {
    clearPidFile();
  }

  if (apiRunning) {
    console.log(
      `Backend API is running at http://${host}:${port}, but it is not managed by this dev script.`
    );
    console.log('Stop that external process manually, then run `npm run dev` again.');
    return;
  }

  console.log('Backend dev server is not running.');
};

if (command === 'stop') {
  await stopManagedServer();
  process.exit(0);
}

if (command === 'status') {
  await printManagedStatus();
  process.exit(0);
}

const existingPidRecord = readPidFile();
if (existingPidRecord?.pid && !isProcessRunning(existingPidRecord.pid)) {
  clearPidFile();
}

if (!(await canListen(port))) {
  const existingApiRunning = await checkExistingApi(port);

  if (existingPidRecord?.pid && isProcessRunning(existingPidRecord.pid) && existingApiRunning) {
    console.log(`Backend API is already running at http://${host}:${port}`);
    console.log(`Managed PID: ${existingPidRecord.pid}`);
    console.log('Run `npm run dev:stop` to stop it, or reuse the existing server.');
    process.exit(0);
  }

  if (existingApiRunning) {
    console.log(`Backend API is already running at http://${host}:${port}`);
    console.log('It was started by another terminal or external process.');
    console.log('Stop that existing process first, then run `npm run dev` again.');
    process.exit(0);
  }

  console.error(`Port ${port} is already in use by another process.`);
  console.error('Stop that process or set PORT to a free port.');
  process.exit(1);
}

const tsxCliPath = resolve(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

const child = spawn(process.execPath, [tsxCliPath, 'watch', 'src/server.ts'], {
  cwd: rootDir,
  env: { ...process.env, PORT: port },
  stdio: 'inherit',
});

writePidFile(child.pid);

const cleanup = () => {
  clearPidFile();
  if (!child.killed && isProcessRunning(child.pid)) {
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {
      // Ignore cleanup failures during shutdown.
    }
  }
};

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

child.on('exit', (code, signal) => {
  clearPidFile();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
