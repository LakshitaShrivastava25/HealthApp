import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Like expo-router's <Redirect>, but it navigates once per destination.
 *
 * <Redirect> calls router.replace() from an inline focus effect, so it
 * fires again on every re-render while its screen is focused. When the
 * session changed underneath an open area — switching User/Doctor mode,
 * signing out — each replace re-rendered the screen, which replaced again:
 * an endless loop that React aborts with "Maximum update depth exceeded",
 * and that closed the release app.
 */
export function RedirectOnce({ href }: { href: Href }) {
  const router = useRouter();
  const target = typeof href === 'string' ? href : JSON.stringify(href);
  const sentTo = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (sentTo.current === target) return;
      sentTo.current = target;
      router.replace(href);
      // href is described by `target`; a fresh object each render must not re-fire.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, router])
  );

  return null;
}
