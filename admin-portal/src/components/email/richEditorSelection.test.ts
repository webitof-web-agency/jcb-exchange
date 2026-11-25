import assert from 'node:assert/strict';
import test from 'node:test';
import { captureEditorSelection } from './richEditorSelection';

test('captures only a selection whose range belongs to the editor', () => {
  const clonedRange = { id: 'cloned-range' };
  const range = {
    commonAncestorContainer: { id: 'editor-node' },
    cloneRange: () => clonedRange,
  };
  const selection = {
    rangeCount: 1,
    getRangeAt: () => range,
  };
  const editor = { contains: (node: unknown) => node === range.commonAncestorContainer };

  assert.equal(captureEditorSelection(editor as unknown as HTMLElement, selection as unknown as Selection), clonedRange);
});

test('ignores selections outside the editor', () => {
  const range = {
    commonAncestorContainer: { id: 'outside-node' },
    cloneRange: () => ({ id: 'should-not-be-captured' }),
  };
  const selection = { rangeCount: 1, getRangeAt: () => range };
  const editor = { contains: () => false };

  assert.equal(captureEditorSelection(editor as unknown as HTMLElement, selection as unknown as Selection), null);
});
