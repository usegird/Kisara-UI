import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n';
import { isRemoteHost } from '@/lib/remote-host';
import { cloudAgreed, useTermsStore } from '@/store/use-terms-store';

export interface CloudConsent {
  readonly confirmFor: (baseUrl: string, proceed: () => void) => void;
  readonly dialog: React.ReactElement;
}

export function useCloudConsent(): CloudConsent {
  const [pending, setPending] = useState<(() => void) | null>(null);

  const confirmFor = (baseUrl: string, proceed: () => void): void => {
    if (isRemoteHost(baseUrl) && !cloudAgreed()) {
      setPending(() => proceed);
      return;
    }
    proceed();
  };

  const onAgreeClick = (): void => {
    const proceed = pending;
    setPending(null);
    useTermsStore.getState().acceptCloud();
    proceed?.();
  };

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title={t('llm.connection.cloudTitle')}
      description={t('llm.connection.cloudNotice')}
      confirmLabel={t('llm.connection.cloudAgree')}
      cancelLabel={t('llm.connection.cloudCancel')}
      onConfirm={onAgreeClick}
      onCancel={() => setPending(null)}
    />
  );
  return { confirmFor, dialog };
}
