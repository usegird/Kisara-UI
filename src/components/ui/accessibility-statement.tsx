import { useState } from 'react';

import { AGREEMENT_LINK, DocumentBody, DocumentDialog } from '@/components/ui/document-body';
import { t } from '@/i18n';

// ─────────────────────────────
// アクセシビリティ方針の行と全文のダイアログ。合意を取らない、読むだけの文書。
// ─────────────────────────────

/** 方針を作った日（本文の末尾に出す）。中身を見直したら書き換える */
const ACCESSIBILITY_STATEMENT_DATE = '2026-11-01';

/** 「利用規約・補足情報」の一覧の 1 行（`li`）と、全文のダイアログ */
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
