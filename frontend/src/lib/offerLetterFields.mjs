// Finds where the candidate signs on an offer letter, so the offer page can show the signature exactly where the
// server stamps it. Mirrors backend/src/utils/offerLetterFields.ts: keep both in step.

/** @typedef {{ text: string; x: number; y: number; width: number; size: number }} TextRun */
/** @typedef {{ width: number; height: number; runs: TextRun[] }} TextPage */
/**
 * @typedef {{
 *   page: number; pageWidth: number; pageHeight: number;
 *   signature: { x: number; y: number; width: number; height: number };
 *   lineAbove: number | null;
 *   date: { x: number; y: number } | null;
 *   place: { x: number; y: number } | null;
 * }} SignatureFields
 */

export const SIGNATURE_HEIGHT = 30;
export const SIGNATURE_MAX_WIDTH = 180;
const SIGNATURE_MIN_WIDTH = 60;
const SIGNATURE_MIN_HEIGHT = 16;
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
/** @param {string} char */
const charWidth = (char) => HELVETICA[char.charCodeAt(0) - 32] ?? 556;

/** @typedef {{ y: number; runs: TextRun[]; text: string; xs: number[]; end: number }} Line */

/**
 * Runs on the same baseline, left to right, with the x position of every character.
 * @param {TextPage} page
 * @returns {Line[]}
 */
const toLines = (page) => {
  /** @type {Array<{ y: number; runs: TextRun[] }>} */
  const groups = [];
  for (const run of [...page.runs].filter((item) => item.text.length > 0).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const group = groups.find((item) => Math.abs(item.y - run.y) <= 2);
    if (group) group.runs.push(run);
    else groups.push({ y: run.y, runs: [run] });
  }
  return groups.map(({ y, runs }) => {
    runs.sort((a, b) => a.x - b.x);
    let text = '';
    /** @type {number[]} */
    const xs = [];
    let end = 0;
    for (const run of runs) {
      if (text && run.x - end > 1 && !/\s$/.test(text) && !/^\s/.test(run.text)) {
        text += ' ';
        xs.push(end);
      }
      const total = [...run.text].reduce((sum, char) => sum + charWidth(char), 0) || 1;
      let offset = 0;
      for (const char of run.text) {
        for (let unit = 0; unit < char.length; unit += 1) xs.push(run.x + (offset / total) * run.width);
        offset += charWidth(char);
        text += char;
      }
      end = Math.max(end, run.x + run.width);
    }
    return { y, runs, text, xs, end };
  });
};

const SIGNATURE_LINE = /(?:^|\s)(?:(?:employee|candidate)(?:['’]s)?\s+)?signature(?:\s+of\s+(?:the\s+)?(?:employee|candidate))?\s*(?::[\s_.]*|[\s.]*_{3,}[\s_.]*)$/i;
const DATE_LINE = /^\s*date(?:\s+of\s+acceptance)?\s*:[\s_.]*$/i;
const PLACE_LINE = /^\s*place\s*:[\s_.]*$/i;

/**
 * x where the blank after a label starts (just after the colon, or at the first underscore).
 * @param {Line} line
 * @param {number} from
 */
const blankStart = (line, from) => {
  const colon = line.text.indexOf(':', from);
  let index = colon >= 0 ? colon + 1 : line.text.indexOf('_', from);
  while (index >= 0 && index < line.text.length && /\s/.test(line.text[index])) index += 1;
  if (index >= 0 && index < line.text.length) return line.xs[index];
  return line.end + 4;
};

/**
 * @param {TextPage} page
 * @param {Line} line
 * @param {number} startX
 */
const signatureBox = (page, line, startX) => {
  const hasBlank = /[_.]{3,}\s*$/.test(line.text);
  const limit = page.width - 24;
  const end = Math.min(hasBlank ? line.end : startX + SIGNATURE_MAX_WIDTH, limit);
  let x = Math.min(startX + 2, limit - SIGNATURE_MIN_WIDTH);
  const y = line.y - BASELINE_DROP;
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
    const lowest = Math.min(...above.map((run) => run.y - run.size * 0.2));
    height = Math.max(SIGNATURE_MIN_HEIGHT, Math.min(SIGNATURE_HEIGHT, lowest - y - 1));
  }
  const width = Math.max(SIGNATURE_MIN_WIDTH, Math.min(SIGNATURE_MAX_WIDTH, end - x));
  return { x, y, width, height };
};

/**
 * Null when the letter has no signature line (a scanned or unusual letter).
 * @param {readonly TextPage[]} pages
 * @returns {SignatureFields | null}
 */
export const findSignatureFields = (pages) => {
  let afterAcceptance = false;
  /** @type {Array<{ page: number; lines: Line[]; line: Line; labelAt: number; afterAcceptance: boolean }>} */
  const candidates = [];
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
  const page = pages[found.page];
  const signature = signatureBox(page, found.line, blankStart(found.line, found.labelAt));
  /** @param {RegExp} pattern */
  const blankBelow = (pattern) => {
    const line = found.lines.find((item) => item.y < found.line.y - 2 && item.y > found.line.y - 60 && pattern.test(item.text));
    return line ? { x: blankStart(line, 0) + 2, y: line.y + 1 } : null;
  };
  const lineAbove = found.lines.filter((item) => item.y > found.line.y + 2 && item.y < found.line.y + 60).map((item) => item.y).sort((a, b) => a - b)[0] ?? null;
  return { page: found.page, pageWidth: page.width, pageHeight: page.height, signature, lineAbove, date: blankBelow(DATE_LINE), place: blankBelow(PLACE_LINE) };
};
