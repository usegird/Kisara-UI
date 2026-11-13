import { useEffect } from 'react';

import { TOAST_TIMEOUT, toastManager } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { useDiagnosticsDialogStore } from '@/store/use-diagnostics-dialog-store';
import { useFaultStore } from '@/store/use-fault-store';

// ─────────────────────────────
// 想定外の失敗を、**画面は止めずに**届いた 1 件ごとにトーストで知らせる。
// タブ種別に依存しない（どのタブの失敗もここに来る）。
// ─────────────────────────────

/** 失敗の知らせを出す。描くものは無い（知らせの出し入れは外の仕組み） */
export function FaultToasts(): null {
  const latest = useFaultStore((state) => state.faults[0]);

  // 新しい失敗が先頭に来たら知らせる（同じ失敗はストアが 1 件にまとめる）
  useEffect(() => {
    if (latest === undefined) return;
    toastManager.add({
      title: t('fault.toast.title', { where: latest.where }),
      description: t('fault.toast.description', { message: latest.message }),
      type: 'error',
      timeout: TOAST_TIMEOUT.error,
      // 診断ファイルのダイアログを開く
      actionProps: {
        children: t('fault.toast.diagnostics'),
        onClick: () => useDiagnosticsDialogStore.getState().open(),
      },
    });
  }, [latest]);

  return null;
}
