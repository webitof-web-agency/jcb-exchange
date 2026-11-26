/** Handwriting fonts that ship with Windows, macOS / iOS and Android. */
export const SIGNATURE_FONT = "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Apple Chancery', 'Snell Roundhand', 'Dancing Script', cursive";

const MAX_TEXT_WIDTH = 900;

/** The typed name written as a signature (transparent PNG data URL): shown on the letter and sent with the acceptance. */
export const renderTypedSignature = (name: string): string | null => {
  const text = name.trim().replace(/\s+/g, ' ');
  if (!text || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  let size = 64;
  context.font = `${size}px ${SIGNATURE_FONT}`;
  const measured = context.measureText(text).width;
  if (measured > MAX_TEXT_WIDTH) size = Math.floor((size * MAX_TEXT_WIDTH) / measured);
  context.font = `${size}px ${SIGNATURE_FONT}`;
  canvas.width = Math.ceil(context.measureText(text).width) + 24;
  canvas.height = Math.ceil(size * 1.65);
  // Resizing the canvas resets the drawing state.
  context.font = `${size}px ${SIGNATURE_FONT}`;
  context.fillStyle = '#0f172a';
  context.textBaseline = 'alphabetic';
  context.fillText(text, 8, Math.ceil(size * 1.15));
  return canvas.toDataURL('image/png');
};
