import { useEffect, type RefObject } from 'react';

/**
 * Closes a popup when the pointer goes down anywhere outside it.
 *
 * Listens for `pointerdown` rather than `click`: a click only lands after
 * the button is released, so a menu would stay open through a drag that
 * starts outside it, and any element the menu overlaps would receive the
 * press first. pointerdown also covers touch without a second listener.
 *
 * The handler ignores presses inside `ref`, and skips entirely while the
 * popup is closed so a page with several of these is not adding listeners
 * it never uses.
 *
 * NOTE: the trigger button must be inside `ref` too, otherwise pressing it
 * to close would fire this handler *and* the button's own toggle — closing
 * and immediately reopening.
 */
export default function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onOutside: () => void,
) {
  useEffect(() => {
    if (!active) return;

    function handlePointerDown(event: PointerEvent) {
      const el = ref.current;
      if (el && !el.contains(event.target as Node)) onOutside();
    }
    function handleEscape(event: KeyboardEvent) {
      // Escape is the other half of the same expectation, and costs nothing
      // to honour while we already have a listener attached.
      if (event.key === 'Escape') onOutside();
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [ref, active, onOutside]);
}
