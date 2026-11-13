// pm2 process definitions for one server (production or staging). Used by deploy/deploy.sh:
//   pm2 startOrReload deploy/ecosystem.config.cjs --update-env
// Each app reads its own .env / .env.production in its folder. Ports and names can be overridden per
// server with the environment variables below, so staging and production can live on the same box.
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const prefix = process.env.PM2_PREFIX || 'jcb';

module.exports = {
  apps: [
    {
      name: `${prefix}-api`,
      cwd: path.join(root, 'backend'),
      script: 'dist/src/server.js',
      // One API process: background jobs and the in-memory rate limiter assume a single instance
      // (see ENABLE_BACKGROUND_JOBS in backend/src/server.ts before scaling out).
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: process.env.API_MAX_MEMORY || '3G',
      kill_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        ...(process.env.API_PORT ? { PORT: process.env.API_PORT } : {}),
      },
    },
    {
      name: `${prefix}-web`,
      cwd: path.join(root, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${process.env.WEB_PORT || 3000}`,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: process.env.WEB_MAX_MEMORY || '2G',
      env: { NODE_ENV: 'production' },
    },
    {
      name: `${prefix}-portal`,
      cwd: path.join(root, 'admin-portal'),
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${process.env.PORTAL_PORT || 3001}`,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: process.env.PORTAL_MAX_MEMORY || '2G',
      env: { NODE_ENV: 'production' },
    },
  ],
};
