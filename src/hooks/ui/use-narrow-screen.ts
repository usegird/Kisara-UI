import { useSyncExternalStore } from 'react';

export const NARROW_SCREEN_QUERY = '(max-width: 767.98px)';

function query(): MediaQueryList | null {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? null
    : window.matchMedia(NARROW_SCREEN_QUERY);
}

function subscribe(onChange: () => void): () => void {
  const list = query();
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
}

function snapshot(): boolean {
  return query()?.matches ?? false;
}

export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
