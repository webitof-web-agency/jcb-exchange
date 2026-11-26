/**
 * Finds where the candidate signs on an offer letter: the "Signature: ____" line of the acceptance block, and its blank
 * "Date" and "Place" lines. Works from the letter's text positions, so it also finds the line on letters generated
 * before signing on the link existed. Pure (no PDF library, no database).
 *
 * The public offer page mirrors this file (frontend/src/lib/offerLetterFields.mjs) so the candidate sees the signature
 * exactly where it is stamped. Keep both in step.
 */

/** One piece of text on a page, in PDF points measured from the bottom-left corner (y is the baseline). */
export type TextRun = { text: string; x: number; y: number; width: number; size: number };
export type TextPage = { width: number; height: number; runs: TextRun[] };

export type SignatureFields = {
  /** 0-based page of the signature line. */
  page: number;
  pageWidth: number;
  pageHeight: number;
  /** Where the signature goes (bottom-left corner and size). */
  signature: { x: number; y: number; width: number; height: number };
  /** Baseline of the line printed just above the signature line (for a close-up of the block). */
  lineAbove: number | null;
  /** Where to write the date / place, when the letter leaves that line blank. */
  date: { x: number; y: number } | null;
  place: { x: number; y: number } | null;
};

export const SIGNATURE_HEIGHT = 30;
export const SIGNATURE_MAX_WIDTH = 180;
const SIGNATURE_MIN_WIDTH = 60;
const SIGNATURE_MIN_HEIGHT = 16;
/** The signature sits a little below the baseline, like ink on a line. */
const BASELINE_DROP = 4;

// Helvetica widths (1/1000 em) of the printable ASCII characters from space (32) to "~" (126).
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];
const charWidth = (char: string) => HELVETICA[char.charCodeAt(0) - 32] ?? 556;

type Line = { y: number; runs: TextRun[]; text: string; xs: number[]; end: number };

/** Runs on the same baseline, left to right, with the x position of every character. */
const toLines = (page: TextPage): Line[] => {
  const groups: Array<{ y: number; runs: TextRun[] }> = [];
  for (const run of [...page.runs].filter((item) => item.text.length > 0).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const group = groups.find((item) => Math.abs(item.y - run.y) <= 2);
    if (group) group.runs.push(run);
    else groups.push({ y: run.y, runs: [run] });
  }
  return groups.map(({ y, runs }) => {
    runs.sort((a, b) => a.x - b.x);
    let text = '';
    const xs: number[] = [];
    let end = 0;
    for (const run of runs) {
      if (text && run.x - end > 1 && !/\s$/.test(text) && !/^\s/.test(run.text)) {
        text += ' ';
        xs.push(end);
      }
      const total = [...run.text].reduce((sum, char) => sum + charWidth(char), 0) || 1;
      let offset = 0;
      for (const char of run.text) {
        // One entry per UTF-16 unit, so indexes found by the patterns below point into xs.
        for (let unit = 0; unit < char.length; unit += 1) xs.push(run.x + (offset / total) * run.width);
        offset += charWidth(char);
        text += char;
      }
      end = Math.max(end, run.x + run.width);
    }
    return { y, runs, text, xs, end };
  });
};

/** "Signature:", "Employee's Signature:", "Candidate Signature ____" with nothing but a blank after it. */
const SIGNATURE_LINE = /(?:^|\s)(?:(?:employee|candidate)(?:['’]s)?\s+)?signature(?:\s+of\s+(?:the\s+)?(?:employee|candidate))?\s*(?::[\s_.]*|[\s.]*_{3,}[\s_.]*)$/i;
const DATE_LINE = /^\s*date(?:\s+of\s+acceptance)?\s*:[\s_.]*$/i;
const PLACE_LINE = /^\s*place\s*:[\s_.]*$/i;

/** x where the blank after a label starts (just after the colon, or at the first underscore). */
const blankStart = (line: Line, from: number) => {
  const colon = line.text.indexOf(':', from);
  let index = colon >= 0 ? colon + 1 : line.text.indexOf('_', from);
  while (index >= 0 && index < line.text.length && /\s/.test(line.text[index]!)) index += 1;
  if (index >= 0 && index < line.text.length) return line.xs[index]!;
  return line.end + 4;
};

const signatureBox = (page: TextPage, line: Line, startX: number) => {
  const hasBlank = /[_.]{3,}\s*$/.test(line.text);
  const limit = page.width - 24;
  const end = Math.min(hasBlank ? line.end : startX + SIGNATURE_MAX_WIDTH, limit);
  let x = Math.min(startX + 2, limit - SIGNATURE_MIN_WIDTH);
  const y = line.y - BASELINE_DROP;
  // Text of the lines just above must stay readable: start the signature after it when there is room.
  const above = page.runs.filter((run) => {
    if (Math.abs(run.y - line.y) <= 2 || !run.text.trim()) return false;
    const bottom = run.y - run.size * 0.2;
    const top = run.y + run.size * 0.75;
    return bottom < y + SIGNATURE_HEIGHT && top > line.y + 6 && run.x < x + SIGNATURE_MAX_WIDTH && run.x + run.width > x;
  });
  let height = SIGNATURE_HEIGHT;
  const clear = above.reduce((right, run) => Math.max(right, run.x + run.width + 6), x);
  if (end - clear >= SIGNATURE_MIN_WIDTH) x = clear;
  else if (above.length) {
    // No room beside it: a smaller signature that stays below that text.
    const lowest = Math.min(...above.map((run) => run.y - run.size * 0.2));
    height = Math.max(SIGNATURE_MIN_HEIGHT, Math.min(SIGNATURE_HEIGHT, lowest - y - 1));
  }
  const width = Math.max(SIGNATURE_MIN_WIDTH, Math.min(SIGNATURE_MAX_WIDTH, end - x));
  return { x, y, width, height };
};

/** Null when the letter has no signature line (a scanned or unusual letter). */
export const findSignatureFields = (pages: readonly TextPage[]): SignatureFields | null => {
  let afterAcceptance = false;
  type Candidate = { page: number; lines: Line[]; line: Line; labelAt: number; afterAcceptance: boolean };
  const candidates: Candidate[] = [];
  pages.forEach((page, index) => {
    const lines = toLines(page);
    for (const line of lines) {
      if (/\bacceptance\b/i.test(line.text)) afterAcceptance = true;
      const match = SIGNATURE_LINE.exec(line.text);
      if (match) candidates.push({ page: index, lines, line, labelAt: match.index, afterAcceptance });
    }
  });
  const found = [...candidates].reverse().find((item) => item.afterAcceptance) ?? candidates[candidates.length - 1];
  if (!found) return null;
  const page = pages[found.page]!;
  const signature = signatureBox(page, found.line, blankStart(found.line, found.labelAt));
  const blankBelow = (pattern: RegExp) => {
    const line = found.lines.find((item) => item.y < found.line.y - 2 && item.y > found.line.y - 60 && pattern.test(item.text));
    return line ? { x: blankStart(line, 0) + 2, y: line.y + 1 } : null;
  };
  return {
    page: found.page,
    pageWidth: page.width,
    pageHeight: page.height,
    signature,
    lineAbove: found.lines.filter((item) => item.y > found.line.y + 2 && item.y < found.line.y + 60).map((item) => item.y).sort((a, b) => a - b)[0] ?? null,
    date: blankBelow(DATE_LINE),
    place: blankBelow(PLACE_LINE),
  };
};
