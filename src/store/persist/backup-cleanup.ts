import { connectedComfyUrl, useConnectionStore } from '@/store/use-connection-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

// ─────────────────────────────
// 古いバックアップの知らせ。ComfyUI につないだとき、ブラウザに元の無い
// 控えのうち 30 日より前の物があれば知らせる。確かめるのはページを開いてから接続先ごとに 1 回
// （つなぎ直しでは繰り返さない）。読めなければ何も出さない。知らせたかどうかは残さない
// ─────────────────────────────

/** 確かめた接続先を覚え、つないだときに確かめる。止めるための関数を返す */
export function startBackupCleanupCheck(): () => void {
  const checked = new Set<string>();
  const check = (): void => {
    const baseUrl = connectedComfyUrl();
    if (baseUrl === null || checked.has(baseUrl)) return;
    checked.add(baseUrl);
    // 数える処理は会話や控えの読み書きを含んで大きいので、つないだときに読む
    void import('@/store/persist/storage-backups')
      .then(({ hasStaleBackups }) => hasStaleBackups(Date.now()))
      .then((stale) => {
        if (stale && connectedComfyUrl() === baseUrl) {
          useStorageDialogStore.getState().notifyStale();
        }
      })
      .catch(() => undefined);
  };
  const unsubscribe = useConnectionStore.subscribe(check);
  check();
  return unsubscribe;
}
