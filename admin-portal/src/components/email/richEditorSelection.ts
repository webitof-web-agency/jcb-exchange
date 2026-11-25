export const captureEditorSelection = (editor: HTMLElement | null, selection: Selection | null): Range | null => {
  if (!editor || !selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
};

export const restoreEditorSelection = (editor: HTMLElement | null, selection: Selection | null, range: Range | null) => {
  if (!editor || !selection || !range) return false;
  editor.focus();
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};
