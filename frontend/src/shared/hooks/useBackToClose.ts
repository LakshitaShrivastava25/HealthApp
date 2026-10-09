import { useEffect, useRef } from 'react';

/**
 * Makes the browser / phone Back button close an open overlay (modal, file
 * viewer, sheet) instead of leaving the page underneath it.
 *
 * Opening an overlay adds one history entry; Back pops it and closes the
 * overlay. Closing it any other way (X, Escape, Save) removes that entry
 * again, so the history never fills up with dead "modal" steps. Overlays
 * opened on top of each other close one at a time, top first.
 */

type Entry = { id: number; close: () => void };

const stack: Entry[] = [];
let nextId = 1;
let selfTriggeredPops = 0;
let listening = false;

function onPopState() {
  if (selfTriggeredPops > 0) {
    // A history.back() we issued to tidy up after a non-Back close.
    selfTriggeredPops -= 1;
    return;
  }
  const top = stack.pop();
  top?.close();
}

export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener('popstate', onPopState);
      listening = true;
    }
    const id = nextId++;
    const entry: Entry = { id, close: () => closeRef.current() };
    stack.push(entry);
    window.history.pushState({ ...(window.history.state ?? {}), overlay: id }, '');

    return () => {
      const index = stack.indexOf(entry);
      if (index === -1) return; // already closed by Back
      stack.splice(index, 1);
      // Closed some other way: drop our history entry — unless the app has
      // since navigated elsewhere, in which case Back must not undo that.
      if ((window.history.state as { overlay?: number } | null)?.overlay === id) {
        selfTriggeredPops += 1;
        window.history.back();
      }
    };
  }, [open]);
}
