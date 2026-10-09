import { lazy, type ComponentType } from 'react';

/**
 * Pages are loaded on demand instead of all shipping in one bundle — the
 * three portals together were a single ~900 KB script that every visitor
 * downloaded before seeing anything.
 *
 * Once a portal's first page is on screen, the rest of that portal's pages
 * are fetched in the background (prefetchPages), so moving between them
 * afterwards is instant rather than waiting on a download.
 */

type Group = 'patient' | 'doctor' | 'admin' | 'public';

const loaders: Record<Group, Array<() => Promise<unknown>>> = {
  patient: [],
  doctor: [],
  admin: [],
  public: [],
};
const prefetched = new Set<Group>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(group: Group, load: () => Promise<{ default: T }>) {
  loaders[group].push(load);
  return lazy(load);
}

export function prefetchPages(group: Group) {
  if (prefetched.has(group)) return;
  prefetched.add(group);
  const run = () => loaders[group].forEach((load) => void load().catch(() => undefined));
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
