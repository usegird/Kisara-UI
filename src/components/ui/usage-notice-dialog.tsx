import { DOCUMENT_TEXT_CLASS, DocumentDialog } from '@/components/ui/document-body';
import { t } from '@/i18n';

const AI_KEYS = ['terms.noticeAi1', 'terms.noticeAi3', 'terms.noticeAi4'] as const;

const CONDITION_KEYS = [
  'terms.condition3',
  'terms.notice1',
  'terms.condition2',
  'terms.noticeAi2',
  'terms.condition4',
] as const;

function UsageNoticeBody(): React.ReactElement {
  const paragraphs = t('terms.noticeIntro').split('\n');
  return (
    <div className={DOCUMENT_TEXT_CLASS}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="indent-[1em]">
          {paragraph}
        </p>
      ))}
      <p className="mt-2 font-medium">{t('terms.conditionsHeading')}</p>
      <ul className="list-disc pl-5">
        {CONDITION_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <p className="mt-2 font-medium">{t('terms.noticeAiHeading')}</p>
      <ul className="list-disc pl-5">
        {AI_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
    </div>
  );
}

export function UsageNoticeDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <DocumentDialog
      id="usage-notice-view"
      open={open}
      onOpenChange={onOpenChange}
      title={t('terms.noticeTitle')}
    >
      <UsageNoticeBody />
    </DocumentDialog>
  );
}
