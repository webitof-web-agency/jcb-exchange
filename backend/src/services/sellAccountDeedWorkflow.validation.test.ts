import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DeedWorkflowValidationError,
  normalizeDeedWorkflowStart,
  resolveEstampState,
} from './sellAccountDeedWorkflow.validation';

test('maps a supported execution state to the eStamp code and eSign display name', () => {
  assert.deepEqual(resolveEstampState(' chhattisgarh '), {
    code: 'CT',
    name: 'Chhattisgarh',
  });
  assert.deepEqual(resolveEstampState('MH'), {
    code: 'MH',
    name: 'Maharashtra',
  });
});

test('creates a safe stamped eSign request only for a PDF deed', () => {
  const result = normalizeDeedWorkflowStart({
    side: 'SALE',
    executionState: 'CT',
    articleId: 4144,
    stampDuty: 100,
    considerationAmount: 500000,
    signerName: '  Customer Name ',
    signerMobile: '9876543210',
    signerEmail: 'customer@example.com',
    signaturePage: 1,
    signatureX: 10,
    signatureY: 20,
  }, {
    fileUrl: '/api/documents/secure/drive-deed-1',
    absoluteUrl: 'https://api.example.com/api/documents/secure/drive-deed-1',
    mimeType: 'application/pdf',
    originalName: 'sale-deed.pdf',
  });

  assert.deepEqual(result, {
    side: 'SALE',
    executionStateCode: 'CT',
    executionStateName: 'Chhattisgarh',
    articleId: 4144,
    stampDuty: 100,
    considerationAmount: 500000,
    signerName: 'Customer Name',
    signerMobile: '9876543210',
    signerEmail: 'customer@example.com',
    signature: { page: 1, x: 10, y: 20 },
  });
});

test('rejects images and malformed monetary or signature input before a provider call', () => {
  assert.throws(
    () => normalizeDeedWorkflowStart({
      side: 'PURCHASE', executionState: 'CT', articleId: 4144, stampDuty: 0,
      considerationAmount: -1, signerName: 'Seller', signerMobile: '123',
      signaturePage: 0, signatureX: -1, signatureY: 10001,
    }, {
      mimeType: 'image/png', fileUrl: '/private/deed.png', absoluteUrl: 'https://api.example.com/private/deed.png', originalName: 'deed.png',
    }),
    (error: unknown) => error instanceof DeedWorkflowValidationError && error.code === 'deed_pdf_required',
  );
});
