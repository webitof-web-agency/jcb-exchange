import React, { useMemo } from 'react';

/**
 * Pure SVG QR Code Generator (Compact QR Model 2 implementation)
 * Produces crisp, dependency-free, vector QR codes that scale cleanly.
 */

// Galois Field (GF 256) tables for Reed-Solomon error correction
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
(function initGf() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val & 0x80 ? 0x11d : 0);
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function getRsGeneratorPoly(errorBlocks: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < errorBlocks; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMultiply(poly[j], factor);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsEncode(data: Uint8Array, errorBlocks: number): Uint8Array {
  const gen = getRsGeneratorPoly(errorBlocks);
  const remainder = new Uint8Array(errorBlocks);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[errorBlocks - 1] = 0;
    for (let j = 0; j < errorBlocks; j++) {
      remainder[j] ^= gfMultiply(gen[j], factor);
    }
  }
  return remainder;
}

// Generate simple Version 3 (29x29) or Version 4 (33x33) QR matrix
function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  // Pick version based on length
  const version = bytes.length > 25 ? 4 : bytes.length > 14 ? 3 : 2;
  const size = 17 + 4 * version; // v2=25, v3=29, v4=33
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isReserved: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean, reserved = true) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      if (reserved) isReserved[r][c] = true;
    }
  };

  // 1. Finder patterns (7x7) at (0,0), (0, size-7), (size-7, 0)
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBlack = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          setModule(nr, nc, isBlack);
        } else {
          setModule(nr, nc, false);
        }
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Alignment pattern (for version >= 2)
  if (version >= 2) {
    const alignPos = version === 2 ? 18 : version === 3 ? 22 : 26;
    const drawAlign = (row: number, col: number) => {
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
          setModule(row + r, col + c, isBlack);
        }
      }
    };
    drawAlign(alignPos, alignPos);
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (matrix[6][i] === null) setModule(6, i, val);
    if (matrix[i][6] === null) setModule(i, 6, val);
  }

  // Dark module
  setModule(4 * version + 9, 8, true);

  // 4. Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isReserved[8][i] = true;
      isReserved[i][8] = true;
    }
  }
  for (let i = size - 8; i < size; i++) {
    isReserved[8][i] = true;
    isReserved[i][8] = true;
  }

  // 5. Data encoding (Byte mode: 0100, length, bytes, terminator, padding)
  const totalCodewords = version === 2 ? 44 : version === 3 ? 70 : 100;
  const ecCodewords = version === 2 ? 16 : version === 3 ? 26 : 36;
  const dataCapacity = totalCodewords - ecCodewords;

  const bitBuffer: number[] = [];
  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bitBuffer.push((value >> i) & 1);
    }
  };

  // Byte mode indicator (0100)
  pushBits(0b0100, 4);
  // Character count (8 bits for versions 1-9 in byte mode)
  pushBits(Math.min(bytes.length, dataCapacity), 8);
  for (let i = 0; i < Math.min(bytes.length, dataCapacity - 2); i++) {
    pushBits(bytes[i], 8);
  }
  // Terminator
  pushBits(0, 4);
  // Pad to multiple of 8
  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  // Convert bits to byte stream
  const dataBytes: number[] = [];
  for (let i = 0; i < bitBuffer.length; i += 8) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitBuffer[i + b];
    }
    dataBytes.push(byteVal);
  }

  // Pad with 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < dataCapacity) {
    dataBytes.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Compute Reed-Solomon EC
  const ec = rsEncode(new Uint8Array(dataBytes), ecCodewords);
  const fullData = [...dataBytes, ...Array.from(ec)];

  // Convert full stream to bits
  const finalBits: number[] = [];
  for (const byte of fullData) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push((byte >> i) & 1);
    }
  }

  // 6. Place data in matrix (zig-zag from right to left)
  let bitIndex = 0;
  let upwards = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const col of [c, c - 1]) {
        if (!isReserved[r][col]) {
          const bit = bitIndex < finalBits.length ? finalBits[bitIndex++] : 0;
          // Apply standard mask pattern 0: (row + col) % 2 === 0
          const mask = (r + col) % 2 === 0;
          matrix[r][col] = (bit === 1) !== mask;
        }
      }
    }
    upwards = !upwards;
  }

  // 7. Format info bits (Level M, mask 0 => 101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  return matrix.map((row) => row.map((cell) => Boolean(cell)));
}

interface QrCodeSvgProps {
  value: string;
  size?: number | string;
  className?: string;
}

export default function QrCodeSvg({ value, size = 64, className = '' }: QrCodeSvgProps) {
  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(value || 'PAN CARD VERIFIED');
    } catch {
      // Fallback matrix
      return generateQrMatrix('PAN');
    }
  }, [value]);

  const count = matrix.length;

  return (
    <svg
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      className={`bg-white ${className}`}
      shapeRendering="crispEdges"
      aria-label="PAN Verification QR Code"
    >
      <rect width={count} height={count} fill="#ffffff" />
      {matrix.map((row, r) =>
        row.map((cell, c) => (cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#0F172A" /> : null))
      )}
    </svg>
  );
}
