import { dialogButton } from '@/components/ui/dialog-button';
import { DOCUMENT_TEXT_CLASS, DocumentDialog } from '@/components/ui/document-body';
import { t } from '@/i18n';

// ─────────────────────────────
// 利用上の注意事項のダイアログ（同意の段と設定の行で共通）。
// ─────────────────────────────

/** AI の出力についての 3 つ（確かめる・専門的な判断に使わない・心の拠り所にしない） */
const AI_KEYS = ['terms.noticeAi1', 'terms.noticeAi3', 'terms.noticeAi4'] as const;

/**
 * 使用上の注意（利用規約から抜粋）。複数の要求は 8 条の事実だが、見守りの理由なので 2 行目に置く
 */
const CONDITION_KEYS = [
  'terms.condition3',
  'terms.notice1',
  'terms.condition2',
  'terms.noticeAi2',
  'terms.condition4',
] as const;

/**
 * 利用上の注意事項の本文。同意の段のポップアップと、設定の行から開く全文で同じものを描く
 */
function UsageNoticeBody(): React.ReactElement {
  // 段落は文言の側で改行して分ける（言語ごとに段落の数が変わっても部品は変えない）
  const paragraphs = t('terms.noticeIntro').split('\n');
  return (
    <div className={DOCUMENT_TEXT_CLASS}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className="indent-[1em]">
          {paragraph}
        </p>
      ))}
      {/* 見出しの前は 1 行あける */}
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

/**
 * 利用上の注意事項のダイアログ。`onAcknowledge` を渡したとき（同意の段で、まだ確認していないとき）
 * だけ末尾に「確認した」を出し、それ以外は読むだけ
 */
export function UsageNoticeDialog({
  open,
  onOpenChange,
  onAcknowledge,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAcknowledge?: (() => void) | undefined;
}): React.ReactElement {
  return (
    <DocumentDialog
      id="usage-notice-view"
      open={open}
      onOpenChange={onOpenChange}
      title={t('terms.noticeTitle')}
    >
      <UsageNoticeBody />
      {onAcknowledge ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className={dialogButton({ tone: 'primary' })}
            onClick={onAcknowledge}
          >
            {t('terms.noticeConfirm')}
          </button>
        </div>
      ) : null}
    </DocumentDialog>
  );
}
