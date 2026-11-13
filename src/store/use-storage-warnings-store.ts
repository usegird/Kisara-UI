import { create } from 'zustand';

import { onStorageWriteFailure } from '@/lib/safe-storage';

// ─────────────────────────────
// 端末に書けなかった（容量の不足・保存を断る設定など）ときの警告。利用者が残したつもりの物だけを
// 警告し、取り直せる控えは警告しない。知らせは `StorageWarningToasts` が出す。
// ─────────────────────────────

/** 書けなかった物の種類 */
type UnsavedKind = 'settings' | 'draft' | 'library';

interface StorageWarningsState {
  /** 最後に書けなかった種類と、通し番号（同じ種類が続いても知らせ直すため） */
  readonly last: { readonly kind: UnsavedKind; readonly serial: number } | null;
}

export const useStorageWarningsStore = create<StorageWarningsState>()(() => ({ last: null }));

/** 書けなかったことを知らせる */
export function warnUnsaved(kind: UnsavedKind): void {
  const serial = (useStorageWarningsStore.getState().last?.serial ?? 0) + 1;
  useStorageWarningsStore.setState({ last: { kind, serial } });
}

// 小さい保存領域（設定・LLM の接続の設定）に書けなかったとき。ブラウザのタブごとの保存領域
// （通知の接続の識別子・タブの並びの控え）は、書けなくても最後に保存した並びが残るので警告しない
onStorageWriteFailure((area) => {
  if (area === 'local') warnUnsaved('settings');
});
