import { Readable } from 'node:stream';

/**
 * Google Drive may return the complete file even when a Range header is sent.
 * This adapter keeps the HTTP range contract correct by exposing only the
 * requested inclusive byte interval to the caller.
 */
export const limitReadableToByteRange = (source: Readable, start: number, end: number): Readable => {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
    throw new Error('A valid inclusive byte range is required.');
  }

  return Readable.from((async function* () {
    let bytesToSkip = start;
    let bytesRemaining = end - start + 1;

    try {
      for await (const chunk of source) {
        if (bytesRemaining <= 0) {
          break;
        }

        let buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        if (bytesToSkip >= buffer.length) {
          bytesToSkip -= buffer.length;
          continue;
        }

        if (bytesToSkip > 0) {
          buffer = buffer.subarray(bytesToSkip);
          bytesToSkip = 0;
        }

        const output = buffer.subarray(0, bytesRemaining);
        bytesRemaining -= output.length;
        if (output.length > 0) {
          yield output;
        }
      }
    } finally {
      if (!source.destroyed) {
        source.destroy();
      }
    }
  })());
};
