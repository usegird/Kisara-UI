import { useState } from 'react';

import { AGREEMENT_LINK, DocumentBody, DocumentDialog } from '@/components/ui/document-body';
import { t } from '@/i18n';

const ACCESSIBILITY_STATEMENT_DATE = '2026-11-01';

export function AccessibilityStatementRow(): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <button type="button" className={AGREEMENT_LINK} onClick={() => setOpen(true)}>
        {t('accessibility.title')}
      </button>
      <DocumentDialog
        id="accessibility-view"
        open={open}
        onOpenChange={setOpen}
        title={t('accessibility.title')}
      >
        <DocumentBody
          text={t('accessibility.body')}
          footer={t('accessibility.date', { date: ACCESSIBILITY_STATEMENT_DATE })}
        />
      </DocumentDialog>
    </li>
  );
}
