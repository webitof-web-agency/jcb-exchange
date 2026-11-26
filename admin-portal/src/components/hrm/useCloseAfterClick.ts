import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Closes an in-place dropdown when the focus leaves it. Closing at once would move everything below it up before the
 * mouse button (or finger) is released, so a click on a button there would land on nothing: after a press, the list
 * closes once the click is done.
 */
export const useCloseAfterClick = (wrapper: RefObject<HTMLElement | null>) => {
  const pressed = useRef(false);
  useEffect(() => {
    const down = () => { pressed.current = true; };
    const up = () => { pressed.current = false; };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };
  }, []);

  return useCallback((close: () => void) => {
    if (!pressed.current) { close(); return; }
    const released = () => {
      document.removeEventListener('pointerup', released, true);
      document.removeEventListener('pointercancel', released, true);
      // The click is dispatched right after the release; the focus may also have come back meanwhile.
      window.setTimeout(() => { if (!wrapper.current?.contains(document.activeElement)) close(); }, 0);
    };
    document.addEventListener('pointerup', released, true);
    document.addEventListener('pointercancel', released, true);
  }, [wrapper]);
};
