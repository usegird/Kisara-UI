import { useSyncExternalStore } from 'react';

// ─────────────────────────────
// 狭い画面の判定。幅が境を越えたときだけ描き直す（大きさの変化ごとには描き直さない）。
// ─────────────────────────────

/** 1 列だけを出す幅。768px ちょうどは横に並べる */
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

/** 表示領域が 1 列だけを出す幅か */
export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
