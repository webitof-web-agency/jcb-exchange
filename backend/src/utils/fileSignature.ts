// Checks that an uploaded file's bytes match the type the browser declared. The browser's MIME type and
// the file name are both chosen by the uploader, so without this a script or HTML page renamed to
// ".pdf" or ".jpg" would pass the upload filter.

const startsWith = (buffer: Buffer, bytes: number[], offset = 0) =>
  buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (buffer: Buffer, start: number, end: number) => buffer.subarray(start, end).toString('latin1');

// ISO base media (MP4 / MOV): the first box type sits at bytes 4-8. Older QuickTime files may open with
// a moov/mdat/wide/free/skip box instead of ftyp.
const QUICKTIME_BOXES = new Set(['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  'image/jpeg': (buffer) => startsWith(buffer, [0xff, 0xd8, 0xff]),
  'image/png': (buffer) => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (buffer) => ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP',
  // The PDF header may be preceded by up to 1 KB of junk (allowed by the PDF spec and common in scans).
  'application/pdf': (buffer) => buffer.subarray(0, 1024).includes('%PDF-'),
  'application/msword': (buffer) => startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (buffer) => startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]),
  'video/mp4': (buffer) => ascii(buffer, 4, 8) === 'ftyp',
  'video/quicktime': (buffer) => QUICKTIME_BOXES.has(ascii(buffer, 4, 8)),
  'video/webm': (buffer) => startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]),
};

/** True when the bytes look like the declared type. Unknown types are refused. */
export const contentMatchesMimeType = (buffer: Buffer | undefined, mimeType: string) => {
  if (!buffer || !buffer.length) return false;
  const check = SIGNATURES[mimeType];
  return Boolean(check && check(buffer));
};

export const FILE_CONTENT_MISMATCH_MESSAGE = 'The file content does not match its type. Upload the original file.';
