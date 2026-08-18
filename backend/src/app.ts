import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRoutes from './routes';
import { ensureUploadDirectories, publicUploadDir } from './utils/documentUpload';

dotenv.config();

const app: Application = express();
ensureUploadDirectories();

// Middleware
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
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

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload.',
    });
  }

  if (
    err.message.includes('Only JPG, PNG, WEBP, and PDF files are allowed.') ||
    err.message.includes('Only JPG, PNG, WEBP, MP4, WEBM, and MOV files are allowed.') ||
    err.message.includes('PDF files must be 3MB or smaller.') ||
    err.message.includes('Image files must be 5MB or smaller.') ||
    err.message.includes('Video files must be 15MB or smaller.') ||
    err.message.includes('File too large')
  ) {
    return res.status(400).json({ success: false, error: err.message });
  }

  if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
    return res.status(404).json({ success: false, error: 'Requested file was not found.' });
  }

  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

export default app;
