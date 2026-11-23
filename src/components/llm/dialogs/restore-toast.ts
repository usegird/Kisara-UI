import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import type { RestoreResult } from '@/store/persist/library-backup';

export function toastRestoreResult(result: RestoreResult): void {
  if (result.failed) {
    toastError(t('llm.backup.restoreFailed'));
    return;
  }
  toastSuccess(t('llm.backup.restored', { added: result.added, updated: result.updated }));
}
