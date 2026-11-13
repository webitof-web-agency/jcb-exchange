// Error monitoring. Imported first by server.ts so it is ready before anything else loads.
// Off unless SENTRY_DSN is set; nothing is sent anywhere without it.
//   SENTRY_DSN=...                  project DSN (sentry.io or self-hosted)
//   SENTRY_ENVIRONMENT=production   defaults to NODE_ENV
//   SENTRY_RELEASE=<git sha>        optional, groups errors by deploy
// Request bodies, cookies and auth headers are never sent: the API handles KYC and payment data.
import 'dotenv/config';
import * as Sentry from '@sentry/node';

const dsn = process.env.SENTRY_DSN?.trim();

export const errorReportingEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.headers) {
          for (const header of Object.keys(event.request.headers)) {
            if (/authorization|cookie|token|signature|api-key/i.test(header)) {
              delete event.request.headers[header];
            }
          }
        }
      }
      delete event.user;
      return event;
    },
  });
}

// Without a DSN, crashes that escape every handler still get one clear log line with a stack.
if (!dsn) {
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
  });
}

export const reportError = (error: unknown, context?: Record<string, unknown>) => {
  if (!dsn) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
};
