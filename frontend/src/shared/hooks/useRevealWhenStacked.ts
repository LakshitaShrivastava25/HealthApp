import { useEffect, type RefObject } from 'react';

/**
 * For a list with a detail panel beside it on desktop: below `lg` the panel
 * stacks under the whole list, so picking an item looked like it did
 * nothing. This brings the panel into view whenever `openKey` changes to an
 * item, on those narrower screens only.
 */
export function useRevealWhenStacked(ref: RefObject<HTMLElement | null>, openKey: unknown) {
  useEffect(() => {
    if (!openKey || !ref.current) return;
    if (!window.matchMedia('(max-width: 1023.98px)').matches) return;
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [openKey, ref]);
}
