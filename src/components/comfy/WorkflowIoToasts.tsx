import { useEffect } from 'react';

import { toastError, toastSuccess } from '@/components/ui/toast-manager';
import type { FileError } from '@/hooks/comfy/use-workflow-io';
import type { SaveState } from '@/hooks/comfy/use-workflow-save';
import { t } from '@/i18n';

export interface WorkflowIoToastsProps {
  readonly saveState: SaveState;
  readonly fileError: FileError | null;
}

export function WorkflowIoToasts({ saveState, fileError }: WorkflowIoToastsProps): null {
  useEffect(() => {
    if (saveState.kind === 'saved') {
      toastSuccess(t('comfy.toasts.saved'), `workflows/${saveState.path}`);
    } else if (saveState.kind === 'error') {
      toastError(t('comfy.toasts.saveFailed'), saveState.message);
    }
  }, [saveState]);

  useEffect(() => {
    if (fileError === null) return;
    toastError(t('comfy.toasts.loadFailed'), fileError.message);
  }, [fileError]);

  return null;
}
