import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t } from '@/i18n';
import { isRemoteHost } from '@/lib/remote-host';
import { cloudAgreed, useTermsStore } from '@/store/use-terms-store';

// ─────────────────────────────
// 私的なアドレスの外へ送る操作の前の、外部クラウド接続の注意への合意の確認。接続と API キーの入力の窓が使う。
// ─────────────────────────────

/** 合意を確かめる手続きと、確認の画面 */
export interface CloudConsent {
  /**
   * 私的なアドレスの外で、まだ合意していなければ確認を出し、合意したら `proceed` を呼ぶ。
   * それ以外はすぐに呼ぶ
   */
  readonly confirmFor: (baseUrl: string, proceed: () => void) => void;
  /** 確認の画面。呼び出し側が描く */
  readonly dialog: React.ReactElement;
}

/** 外部クラウド接続の注意への合意を、送る操作の前に確かめる */
export function useCloudConsent(): CloudConsent {
  // 合意したら続ける操作。確認を出していない間は null
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
    // 押した手続きの中で続ける（入力の窓のポップアップは利用者の操作の中でしか開けない）
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
