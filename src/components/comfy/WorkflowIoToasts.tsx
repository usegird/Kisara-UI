import { useEffect } from 'react';

import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import type { FileError } from '@/hooks/comfy/use-workflow-io';
import type { SaveState } from '@/hooks/comfy/use-workflow-save';
import { t } from '@/i18n';

// ─────────────────────────────
// ワークフローの保存の結果と読み込みの失敗をトーストで知らせる。接続の失敗は新しいタブの案内が出す。
// 描くものは無い（知らせの出し入れは外の仕組み）。
// ─────────────────────────────

/** 出し入れの知らせの props */
export interface WorkflowIoToastsProps {
  /** 保存の状態。変わったら結果を知らせる */
  readonly saveState: SaveState;
  /** ワークフローを読み込めなかった理由 */
  readonly fileError: FileError | null;
}

/** 保存の結果と読み込みの失敗が変わるたびにトーストを足す */
export function WorkflowIoToasts({ saveState, fileError }: WorkflowIoToastsProps): null {
  // 保存の結果が変わったら知らせる
  useEffect(() => {
    if (saveState.kind === 'saved') {
      toastSuccess(t('comfy.toasts.saved'), `workflows/${saveState.path}`);
    } else if (saveState.kind === 'error') {
      toastError(t('comfy.toasts.saveFailed'), saveState.message);
    }
  }, [saveState]);

  // 読み込めなかったら理由を知らせる（失敗のたびに別のものが来る）
  useEffect(() => {
    if (fileError === null) return;
    toastError(t('comfy.toasts.loadFailed'), fileError.message);
  }, [fileError]);

  return null;
}
