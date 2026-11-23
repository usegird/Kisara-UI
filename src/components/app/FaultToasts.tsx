import { useEffect } from 'react';

import { TOAST_TIMEOUT, toastManager } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useDiagnosticsDialogStore } from '@/store/use-diagnostics-dialog-store';
import { useFaultStore } from '@/store/use-fault-store';

export function FaultToasts(): null {
  const latest = useFaultStore((state) => state.faults[0]);

  useEffect(() => {
    if (latest === undefined) return;
    toastManager.add({
      title: t('fault.toast.title', { where: latest.where }),
      description: t('fault.toast.description', { message: latest.message }),
      type: 'error',
      timeout: TOAST_TIMEOUT.error,
      actionProps: {
        children: t('fault.toast.diagnostics'),
        onClick: () => useDiagnosticsDialogStore.getState().open(),
      },
    });
  }, [latest]);

  return null;
}
