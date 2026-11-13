import { CARD_FILE_MAX_BYTES } from '@/chat/card-read';
import { IMAGE_FILE_MAX_BYTES, MEGABYTE } from '@/lib/file-size';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 書き出したファイル・ComfyUI のバックアップから戻す 1 件の大きさの上限。
// 取り込むときと同じ上限にする（会話は設定の会話の上限、アバターの画像は 20 MB、ほかは 32 MB）。
// 大きさは一覧に出す大きさと同じ見積もり（バイトの目安）で比べる
// ─────────────────────────────

/** 戻す 1 件の種類（上限が種類で違う） */
type RestoreSizeKind = 'chat' | 'avatar' | 'other';

/** その種類の 1 件の大きさの上限（バイト） */
function restoreLimit(kind: RestoreSizeKind): number {
  if (kind === 'chat') return useSettingsStore.getState().chatMaxMegabytes * MEGABYTE;
  return kind === 'avatar' ? IMAGE_FILE_MAX_BYTES : CARD_FILE_MAX_BYTES;
}

/** 上限を超えるか */
export function overRestoreLimit(kind: RestoreSizeKind, bytes: number): boolean {
  return bytes > restoreLimit(kind);
}
