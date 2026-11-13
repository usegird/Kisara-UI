import { useEffect } from 'react';

import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useStorageWarningsStore } from '@/store/use-storage-warnings-store';

// ─────────────────────────────
// 端末に書けなかった物をトーストで警告する。
// ─────────────────────────────

/** 書けなかった物の警告を出す。描くものは無い（知らせの出し入れは外の仕組み） */
export function StorageWarningToasts(): null {
  const last = useStorageWarningsStore((state) => state.last);

  useEffect(() => {
    if (last === null) return;
    toastError(t(`storageWarning.${last.kind}`), t('storageWarning.description'));
  }, [last]);

  return null;
}
