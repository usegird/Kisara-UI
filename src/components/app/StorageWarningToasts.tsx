import { useEffect } from 'react';

import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useStorageWarningsStore } from '@/store/use-storage-warnings-store';

export function StorageWarningToasts(): null {
  const last = useStorageWarningsStore((state) => state.last);

  useEffect(() => {
    if (last === null) return;
    toastError(t(`storageWarning.${last.kind}`), t('storageWarning.description'));
  }, [last]);

  return null;
}
