import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { isAllowedOrigin, resolveCorsOrigins } from './utils/corsOrigins';
import apiRoutes from './routes';
import whatsappWebhookRoutes from './routes/whatsappWebhook.routes';
import apiWalletBillingWebhookRoutes from './routes/apiWalletBillingWebhook.routes';
import { publicUploadDir } from './utils/documentUpload';
import { sanitizeRequest } from './middlewares/sanitizeRequest.middleware';
import { FieldValidationError } from './utils/fieldValidation';
import { FILE_CONTENT_MISMATCH_MESSAGE } from './utils/fileSignature';

dotenv.config();

const app: Application = express();

// The API sits behind one reverse proxy (nginx / the host's load balancer), so req.ip is the visitor's
// address taken from X-Forwarded-For; rate limits depend on it. TRUST_PROXY overrides the hop count.
app.set('trust proxy', Number.parseInt(process.env.TRUST_PROXY ?? '1', 10) || false);

// Middleware
const allowedOrigins = resolveCorsOrigins();
// Security headers. The API serves no pages of its own, so helmet's strict default CSP stays on. Uploaded
// images are shown on the website's domain (cross-origin resources), and the website and admin portal
// preview API documents (PDFs, receipts) in iframes, so only those sites may frame API responses.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  xFrameOptions: false,
  contentSecurityPolicy: {
    directives: {
      'frame-ancestors': [
        "'self'",
        ...allowedOrigins,
        ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:*', 'http://127.0.0.1:*']),
      ],
    },
  },
}));
app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin, allowedOrigins)) }));
// Meta signs the unparsed webhook payload. This route must remain before express.json().
app.use('/api/whatsapp/webhook', whatsappWebhookRoutes);
// Wallet webhook signatures cover the exact raw JSON payload, so this route must also
// remain before express.json().
app.use('/api/api-billing/webhook', express.raw({ type: 'application/json', limit: '64kb' }), apiWalletBillingWebhookRoutes);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
// Every form and API call: strip tags and control characters from strings, drop prototype keys.
// Multipart forms are cleaned on their routes, after multer has parsed them.
app.use(sanitizeRequest);
// Serve branding images (hero, logo, certification) stored on the server's
// public upload directory. These are written to disk by the upload handlers
// and fetched directly by the frontend — no Drive dependency needed.
app.use('/uploads/public', express.static(publicUploadDir));

// API Routes
app.use('/api', apiRoutes);

// Basic Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'JCB Exchange API is running' });
});

// Default Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);

  // Wrong format in a form field (mobile, email, PAN, GSTIN ...): tell the user which field.
  if (err instanceof FieldValidationError) {
    return res.status(400).json({ success: false, error: err.message, field: err.field });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload.',
    });
  }

  if (
    err.message.includes('Only JPG, PNG, WEBP, and PDF files are allowed.') ||
    err.message.includes('Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed.') ||
    err.message.includes('Only JPG, PNG, and WEBP avatar images are allowed.') ||
    err.message.includes('PDF files must be 3MB or smaller.') ||
    err.message.includes('Image files must be 5MB or smaller.') ||
    err.message.includes('Video files must be 15MB or smaller.') ||
    err.message.includes('File too large') ||
    err.message.includes(FILE_CONTENT_MISMATCH_MESSAGE)
  ) {
    return res.status(400).json({ success: false, error: err.message });
  }

  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    return res.status(404).json({ success: false, error: 'Requested file was not found.' });
  }

  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

export default app;
