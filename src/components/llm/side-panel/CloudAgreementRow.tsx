import { AgreementRow } from '@/components/ui/terms-dialog';
import { t } from '@/i18n';
import { useTermsStore } from '@/store/use-terms-store';

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
