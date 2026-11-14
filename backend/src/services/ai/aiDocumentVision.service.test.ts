import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeDocumentImage,
  normalizeDocumentAnalysis,
  type AiDocumentAnalysis,
} from './aiDocumentVision.service';

const config = {
  enabled: true,
  provider: 'openai' as const,
  model: 'gpt-4o-mini',
  apiKey: 'test-key',
  requestTimeoutMs: 5_000,
  maxInputChars: 4_000,
  maxOutputChars: 2_000,
  maxOutputTokens: 500,
};

test('normalizes document extraction without returning raw identity, OCR, contact, or document data', () => {
  const result = normalizeDocumentAnalysis({
    documentType: 'RC',
    documentDetected: true,
    qualityScore: 121,
    issues: ['phone 9876543210 is visible', 'owner email john@example.com'],
    registrationNumber: 'DL01AB1234',
    pan: 'ABCDE1234F',
    gstin: '27AAPFU0939F1ZV',
    ownerName: 'John Doe',
    phone: '9876543210',
    rawText: 'PRIVATE OCR TEXT',
    vehicleMake: 'JCB',
    vehicleModel: '3DX',
    confidence: 0.87,
  });

  assert.deepEqual(result, {
    documentType: 'RC',
    documentDetected: true,
    qualityScore: 100,
    issues: ['phone [REDACTED_MOBILE] is visible', 'owner email [REDACTED_EMAIL]'],
    extracted: {
      registrationNumberMasked: '••••1234',
      vehicleMake: 'JCB',
      vehicleModel: '3DX',
    },
    reviewRequired: false,
  } satisfies AiDocumentAnalysis);
  assert.equal(JSON.stringify(result).includes('PRIVATE OCR TEXT'), false);
  assert.equal(JSON.stringify(result).includes('ABCDE1234F'), false);
  assert.equal(JSON.stringify(result).includes('27AAPFU0939F1ZV'), false);
  assert.equal(JSON.stringify(result).includes('John Doe'), false);
});

test('normalizes finance image analysis to bounded non-sensitive amounts', () => {
  const result = normalizeDocumentAnalysis({
    documentType: 'FINANCE',
    documentDetected: true,
    qualityScore: 82.6,
    documentKind: 'invoice',
    subtotal: 1000.456,
    taxAmount: 180.8,
    totalAmount: 1181.256,
    currency: 'INR',
    invoiceNumber: 'INV-2026-0001',
    bankAccount: '1234567890',
    reviewRequired: false,
  });

  assert.deepEqual(result.extracted, {
    documentKind: 'INVOICE',
    subtotal: 1000.46,
    taxAmount: 180.8,
    totalAmount: 1181.26,
    currency: 'INR',
    invoiceNumberMasked: '••••0001',
  });
  assert.equal(JSON.stringify(result).includes('1234567890'), false);
  assert.equal(result.reviewRequired, false);
});

test('sends a bounded image data URL and document-specific no-raw-OCR instructions to OpenAI Vision', async () => {
  let request: Record<string, unknown> | undefined;
  const analysis = await analyzeDocumentImage({
    buffer: Buffer.from('fake-image'),
    mimeType: 'image/png',
    documentType: 'GST',
    dependencies: {
      configReader: () => config,
      providerFactory: () => ({
        complete: async (value) => {
          request = value as unknown as Record<string, unknown>;
          return { text: JSON.stringify({ documentType: 'GST', documentDetected: true, gstin: '27AAPFU0939F1ZV' }) };
        },
      }),
    },
  });

  assert.equal(analysis.documentType, 'GST');
  assert.equal(request?.imageDataUrl, `data:image/png;base64,${Buffer.from('fake-image').toString('base64')}`);
  assert.match(String(request?.systemPrompt), /do not return raw OCR/i);
  assert.match(String(request?.systemPrompt), /GST/i);
});

test('rejects non-image input and unsupported document types before provider access', async () => {
  await assert.rejects(
    analyzeDocumentImage({
      buffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      documentType: 'RC',
      dependencies: { configReader: () => config, providerFactory: () => { throw new Error('provider must not run'); } },
    }),
    /Only JPEG, PNG, and WEBP document images can be analysed/,
  );

  await assert.rejects(
    analyzeDocumentImage({
      buffer: Buffer.from('image'),
      mimeType: 'image/jpeg',
      documentType: 'AADHAAR' as never,
      dependencies: { configReader: () => config, providerFactory: () => { throw new Error('provider must not run'); } },
    }),
    /Unsupported AI document type/,
  );
});
