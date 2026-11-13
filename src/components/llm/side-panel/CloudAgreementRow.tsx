import { AgreementRow } from '@/components/ui/terms-dialog';
import { t } from '@/i18n';
import { useTermsStore } from '@/store/use-terms-store';

// ─────────────────────────────
// 会話の設定のタブの「利用規約・補足情報」に足す、時刻だけの合意の行。合意そのものは、外部のクラウドに
// 初めてつなぐ前（LlmEndpointField）と、確認を省く設定を入れる前（ChatExtensionPanel）に取る。
// ─────────────────────────────

/** 外部のクラウドのサービスにつなぐ注意の合意の行 */
export function CloudAgreementRow(): React.ReactElement {
  const acceptedAt = useTermsStore((state) => state.cloud?.acceptedAt ?? null);
  return (
    <AgreementRow
      id="cloud-notice-view"
      title={t('llm.connection.cloudTitle')}
      notice={t('llm.connection.cloudNotice')}
      acceptedAt={acceptedAt}
    />
  );
}

/**
 * Workflow の実行前の確認を行わない注意の合意の行
 */
export function BypassAgreementRow(): React.ReactElement {
  const acceptedAt = useTermsStore((state) => state.bypass?.acceptedAt ?? null);
  return (
    <AgreementRow
      id="bypass-notice-view"
      title={t('llm.extension.comfy.bypassTitle')}
      notice={t('llm.extension.comfy.bypassNotice')}
      acceptedAt={acceptedAt}
    />
  );
}
