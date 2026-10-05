const MOJIBAKE_MARKERS = /[ÃÂâàð�]/g;
const WINDOWS_1252_REVERSE: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e,
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

const markerCount = (value: string) => value.match(MOJIBAKE_MARKERS)?.length || 0;

export const normalizeMultipartFilename = (filename: string) => {
  if (!filename || !/[ÃÂâàð]/.test(filename)) {
    return filename;
  }

  const bytes = Uint8Array.from([...filename].map((character) => {
    const codePoint = WINDOWS_1252_REVERSE[character] ?? character.codePointAt(0) ?? 0;
    return codePoint <= 0xff ? codePoint : 0x3f;
  }));
  const decoded = Buffer.from(bytes).toString('utf8');
  if (decoded.includes('\uFFFD')) {
    return filename;
  }

  return markerCount(decoded) < markerCount(filename) ? decoded : filename;
};
