export type ByteRange = {
  start: number;
  end: number;
  length: number;
  total: number;
};

export const parseSingleByteRange = (header: string | undefined, total: number): ByteRange | null => {
  if (!header || !Number.isSafeInteger(total) || total <= 0) return null;

  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= total || requestedEnd < start) {
    return null;
  }

  const end = Math.min(requestedEnd, total - 1);
  return {
    start,
    end,
    length: end - start + 1,
    total,
  };
};
