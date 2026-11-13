import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import type { RestoreResult } from '@/store/persist/library-backup';

// ─────────────────────────────
// 控えから戻した結果の知らせ。設定のタブの戻すボタンとストレージの管理で使う。
// ─────────────────────────────

/** 控えから戻した結果（失敗か、足した数・更新した数）をトーストで知らせる */
export function toastRestoreResult(result: RestoreResult): void {
  if (result.failed) {
    toastError(t('llm.backup.restoreFailed'));
    return;
  }
  toastSuccess(t('llm.backup.restored', { added: result.added, updated: result.updated }));
}
