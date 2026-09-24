import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { createUploadPublicListingMedia } from './document.controller';

test('uploads listing media through Google Drive and returns its Drive URL', async () => {
  const uploadedFile = {
    buffer: Buffer.from('image-bytes'),
    mimetype: 'image/png',
    originalname: 'machine.png',
    size: 11,
  } as Express.Multer.File;
  const uploadCalls: Array<{ buffer: Buffer; mimeType: string; filename: string }> = [];
  const uploadToDrive = async (
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ) => {
    uploadCalls.push({ buffer, mimeType, filename });
    return {
      fileId: 'drive-file-id-123',
      viewLink: 'https://drive.google.com/uc?id=drive-file-id-123',
    };
  };

  const responseState: { statusCode: number; body?: unknown } = { statusCode: 0 };
  const response = {
    status(code: number) {
      responseState.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      responseState.body = payload;
      return response;
    },
  } as unknown as Response;
  const next = () => {
    throw new Error('The listing media upload should not fail.');
  };
  const request = {
    file: uploadedFile,
    protocol: 'http',
    get: (header: string) => (header.toLowerCase() === 'host' ? 'localhost:5002' : undefined),
  } as unknown as Request;

  await createUploadPublicListingMedia(uploadToDrive)(request, response, next);

  assert.equal(responseState.statusCode, 201);
  assert.equal(uploadCalls.length, 1);
  assert.deepEqual(uploadCalls[0]!.buffer, uploadedFile.buffer);
  assert.equal(uploadCalls[0]!.mimeType, uploadedFile.mimetype);
  assert.match(uploadCalls[0]!.filename, /^listing-media-[a-zA-Z0-9-]+\.png$/);
  assert.deepEqual((responseState.body as { file: Record<string, unknown> }).file, {
    access: 'public',
    fileName: uploadCalls[0]!.filename,
    originalName: 'machine.png',
    mimeType: 'image/png',
    size: 11,
    fileUrl: 'https://drive.google.com/uc?id=drive-file-id-123',
    absoluteUrl: 'https://drive.google.com/uc?id=drive-file-id-123',
  });
});
