import { crc32, deflateSync, inflateSync } from 'node:zlib';

/**
 * Checks a PNG somebody sent before a PDF library reads it, and rebuilds it. A damaged or crafted file can freeze the
 * PDF libraries, use up the memory or stop the server, so only a complete, ordinary picture (8 bits per channel, no
 * palette, not interlaced, within the size limit) is passed on.
 */

export type PngLimits = { width: number; height: number; pixels: number };
/** A signature typed or drawn on the offer page (the page sends at most about 960 x 200). */
export const SIGNATURE_LIMITS: PngLimits = { width: 2000, height: 1000, pixels: 2_000_000 };
/** A photographed or scanned page shown on the acceptance certificate. */
export const SCAN_LIMITS: PngLimits = { width: 6000, height: 6000, pixels: 12_000_000 };

const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Bytes per pixel of the accepted colour types: grey, RGB, grey with alpha, RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export const isPng = (buffer: Buffer) => buffer.length >= MAGIC.length && buffer.subarray(0, MAGIC.length).equals(MAGIC);

const chunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, check]);
};

/** The picture rebuilt from its header and pixels only, or null when it must not be used. */
export const cleanPng = (buffer: Buffer, limits: PngLimits): Buffer | null => {
  if (!isPng(buffer)) return null;
  let header: Buffer | null = null;
  const compressed: Buffer[] = [];
  let ended = false;
  let offset = MAGIC.length;
  while (!ended && offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) return null;
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (offset === MAGIC.length) {
      if (type !== 'IHDR' || length !== 13) return null;
      header = body;
    } else if (type === 'IHDR') return null;
    else if (type === 'IDAT') compressed.push(body);
    else if (type === 'IEND') ended = true;
    offset += 12 + length;
  }
  if (!header || !compressed.length || !ended) return null;

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const [depth, colour = -1, compression, filter, interlace] = header.subarray(8, 13);
  const channels = CHANNELS[colour];
  if (!channels || depth !== 8 || compression || filter || interlace) return null;
  if (!width || !height || width > limits.width || height > limits.height || width * height > limits.pixels) return null;

  const row = width * channels + 1;
  let pixels: Buffer;
  try {
    pixels = inflateSync(Buffer.concat(compressed), { maxOutputLength: row * height });
  } catch {
    return null;
  }
  if (pixels.length !== row * height) return null;
  // Every row starts with its filter type, 0 to 4.
  for (let y = 0; y < height; y += 1) if (pixels[y * row]! > 4) return null;
  return Buffer.concat([MAGIC, chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
};
