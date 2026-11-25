/**
 * Reference-counted "no scrolling behind the dialog" lock. Several dialogs can be open at once (the Manage lists open on
 * top of Add Employee): each one takes a lock and gives it back, and the page's own overflow value is saved by the
 * first lock and put back by the last one, so closing the inner dialog never unlocks the page under the outer one and
 * closing both never leaves it locked.
 */
export type ScrollTarget = { style: { overflow: string } };

export const createScrollLock = (getTarget: () => ScrollTarget | null) => {
  let holders = 0;
  let saved = '';
  let locked: ScrollTarget | null = null;

  /** Takes a lock; the returned function gives that same lock back (calling it twice does nothing the second time). */
  const acquire = () => {
    if (holders === 0) {
      locked = getTarget();
      if (locked) {
        saved = locked.style.overflow;
        locked.style.overflow = 'hidden';
      }
    }
    holders += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      holders = Math.max(0, holders - 1);
      if (holders === 0 && locked) {
        locked.style.overflow = saved;
        locked = null;
      }
    };
  };

  return { acquire, holders: () => holders };
};

/** The lock every HRM dialog shares (the document body). */
export const bodyScrollLock = createScrollLock(() => (typeof document === 'undefined' ? null : document.body));
