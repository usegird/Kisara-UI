import { useState } from 'react';

import { AccessibilityStatementRow } from '@/components/ui/accessibility-statement';
import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { AGREEMENT_LINK, DocumentBody, DocumentDialog } from '@/components/ui/document-body';
import { UsageNoticeDialog } from '@/components/ui/usage-notice-dialog';
import { activeLocale, legal, t } from '@/i18n';
import {
  isAccepted,
  NOTICE_REVISION,
  PRIVACY_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE,
  TERMS_REVISION,
  useTermsStore,
} from '@/store/use-terms-store';

interface PrivacyDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function PrivacyDialog({ open, onOpenChange }: PrivacyDialogProps): React.ReactElement {
  return (
    <DocumentDialog
      id="privacy-view"
      open={open}
      onOpenChange={onOpenChange}
      title={t('privacy.title')}
      wide
    >
      <DocumentBody
        text={legal('privacy')}
        footer={t('privacy.version', { date: PRIVACY_EFFECTIVE_DATE })}
      />
    </DocumentDialog>
  );
}

export { AGREEMENT_LINK };

function TermsViewDialog({ open, onOpenChange }: PrivacyDialogProps): React.ReactElement {
  return (
    <DocumentDialog
      id="terms-view"
      open={open}
      onOpenChange={onOpenChange}
      title={t('terms.title')}
      wide
    >
      <DocumentBody
        text={legal('terms')}
        footer={t('terms.version', { revision: TERMS_REVISION, date: TERMS_EFFECTIVE_DATE })}
      />
    </DocumentDialog>
  );
}

function formatAgreed(acceptedAt: string | null): string {
  if (acceptedAt === null) return t('terms.notAgreed');
  const date = new Date(acceptedAt);
  if (Number.isNaN(date.getTime())) return t('terms.notAgreed');
  return t('terms.agreedAt', {
    date: date.toLocaleString(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

export function TermsFields({
  children,
}: {
  readonly children?: React.ReactNode;
}): React.ReactElement {
  const [viewing, setViewing] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const acceptedAt = useTermsStore((state) => state.accepted?.acceptedAt ?? null);
  return (
    <>
      <span className={SETTING_HEADING_CLASS}>{t('terms.agreements')}</span>
      <ul className="text-muted-foreground flex flex-col gap-1 px-1">
        <li className="flex flex-wrap items-baseline gap-x-2">
          <button type="button" className={AGREEMENT_LINK} onClick={() => setViewing(true)}>
            {t('terms.title')}
          </button>
          <span className="tabular-nums">{formatAgreed(acceptedAt)}</span>
        </li>
        <li className="flex flex-wrap items-baseline gap-x-2">
          <button type="button" className={AGREEMENT_LINK} onClick={() => setPrivacy(true)}>
            {t('privacy.title')}
          </button>
          <span className="tabular-nums">{formatAgreed(acceptedAt)}</span>
        </li>
        <UsageNoticeRow />
        {children}
        <AccessibilityStatementRow />
      </ul>
      <TermsViewDialog open={viewing} onOpenChange={setViewing} />
      <PrivacyDialog open={privacy} onOpenChange={setPrivacy} />
    </>
  );
}

export function AgreementRow({
  id,
  title,
  notice,
  acceptedAt,
}: {
  readonly id: string;
  readonly title: string;
  readonly notice: string;
  readonly acceptedAt: string | null;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <button type="button" className={AGREEMENT_LINK} onClick={() => setOpen(true)}>
        {title}
      </button>
      <span className="tabular-nums">{formatAgreed(acceptedAt)}</span>
      <DocumentDialog id={id} open={open} onOpenChange={setOpen} title={title}>
        <DocumentBody text={notice} />
      </DocumentDialog>
    </li>
  );
}

export function ComfyRemoteAgreementRow(): React.ReactElement {
  const acceptedAt = useTermsStore((state) => state.comfyRemote?.acceptedAt ?? null);
  return (
    <AgreementRow
      id="comfy-remote-notice-view"
      title={t('comfy.connection.remoteTitle')}
      notice={t('comfy.connection.remoteNotice')}
      acceptedAt={acceptedAt}
    />
  );
}

function UsageNoticeRow(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const acceptedAt = useTermsStore((state) =>
    isAccepted(state.notice, NOTICE_REVISION) ? (state.notice?.acceptedAt ?? null) : null,
  );
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <button type="button" className={AGREEMENT_LINK} onClick={() => setOpen(true)}>
        {t('terms.noticeTitle')}
      </button>
      <span className="tabular-nums">{formatAgreed(acceptedAt)}</span>
      <UsageNoticeDialog open={open} onOpenChange={setOpen} />
    </li>
  );
}
