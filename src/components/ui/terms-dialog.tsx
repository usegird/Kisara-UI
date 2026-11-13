import { useState } from 'react';

import { AccessibilityStatementRow } from '@/components/ui/accessibility-statement';
import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { dialogButton } from '@/components/ui/dialog-button';
import { AGREEMENT_LINK, DocumentBody, DocumentDialog } from '@/components/ui/document-body';
import { UsageNoticeDialog } from '@/components/ui/usage-notice-dialog';
import { activeLocale, legal, t, tParts } from '@/i18n';
import {
  isAccepted,
  NOTICE_REVISION,
  PRIVACY_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE,
  TERMS_REVISION,
  useTermsStore,
} from '@/store/use-terms-store';

// ─────────────────────────────
// 利用規約への同意。はじめの画面の同意の段と、設定のタブ・新しいタブの頁が共有する
// 「利用規約・補足情報」の行。同意するまで外枠を組まないので、外枠の上に出す同意のダイアログは持たない。
// ─────────────────────────────

interface PrivacyDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** プライバシーポリシー。同意のダイアログと設定の行の両方から開く。閉じると開いた側に戻る */
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

// 規約の名前のリンクの見た目は本文と同じ置き場に持ち、ここからも渡す（会話の層の行が使う）
export { AGREEMENT_LINK };

/** 規約の全文を閉じられるダイアログで出す（設定の行とランディングの同意の段から開く） */
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

/** 合意した日時（画面の言語の表記）。合意していなければ「未合意」 */
function formatAgreed(acceptedAt: string | null): string {
  if (acceptedAt === null) return t('terms.notAgreed');
  const date = new Date(acceptedAt);
  if (Number.isNaN(date.getTime())) return t('terms.notAgreed');
  return t('terms.agreedAt', {
    date: date.toLocaleString(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }),
  });
}

/**
 * 設定のタブの最下段の「利用規約・補足情報」。合意する文書を 1 行に 1 つ、名前のリンクと
 * 合意した日時で並べる。種別ごとの文書（外部クラウド接続の注意など）は `children` で足す
 */
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
          {/* 利用規約と同じ同意の印でまとめて取るので、同じ日時 */}
          <span className="tabular-nums">{formatAgreed(acceptedAt)}</span>
        </li>
        {/* 利用上の注意事項（確認の記録。同意ではない） */}
        <UsageNoticeRow />
        {/* 種別ごとの文書は利用規約・プライバシーポリシーの後ろ */}
        {children}
        {/* 合意を取らない、読むだけの文書は最後 */}
        <AccessibilityStatementRow />
      </ul>
      <TermsViewDialog open={viewing} onOpenChange={setViewing} />
      <PrivacyDialog open={privacy} onOpenChange={setPrivacy} />
    </>
  );
}

/**
 * 時刻だけの合意の行。名前のリンクで注意の全文を開き、合意した日時を併記する。
 * 外部クラウド接続の注意・外部の ComfyUI の注意・Workflow の実行前の確認を行わない注意で使う
 */
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

/** 外部の ComfyUI（私的なアドレスの外）に接続する注意の行。ComfyUI の設定のタブに置く */
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

/** 設定のタブの「利用上の注意事項」の行。名前のリンクで全文を開き、確認した日時を添える */
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

/** 同意の段の props */
export interface TermsConsentProps {
  /** 同意して始めるを押した後に呼ぶ（はじめの画面を閉じる） */
  readonly onStart?: () => void;
}

/**
 * 同意の段。規約の確認を求める一言・利用上の注意事項の確認の印・同意の印・「同意して始める」を置く。
 * ボタンの名前は規約の本文がこのボタンで同意すると定めるので変えない。注意事項の印は押すとポップアップが
 * 開き、末尾の「確認した」で入る（開いて押した記録を残すため。無効の印は置かない）。同意済みなら
 * 「同意して始める」は同意を取り直さずに `onStart` だけを呼ぶ
 */
export function TermsConsent({ onStart }: TermsConsentProps): React.ReactElement {
  const [viewing, setViewing] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [consented, setConsented] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const saved = useTermsStore((state) => state.accepted);
  const accepted = isAccepted(saved);
  const revised = saved !== null && !accepted;
  const accept = useTermsStore((state) => state.accept);
  const noticeSeen = useTermsStore((state) => isAccepted(state.notice, NOTICE_REVISION));
  const acknowledgeNotice = useTermsStore((state) => state.acknowledgeNotice);
  return (
    <div className="flex flex-col gap-2 text-xs">
      {revised ? <p>{t('terms.revisedSummary', { date: TERMS_EFFECTIVE_DATE })}</p> : null}
      {/* 確認を求める一言の、文書の名前の所をその文書を開くリンクにする（語順は文言の側が持つ） */}
      <p>
        {tParts('terms.landingSummary').map((part, index) =>
          index % 2 === 0 ? (
            part
          ) : (
            <button
              key={part}
              type="button"
              className={AGREEMENT_LINK}
              onClick={() => (part === 'privacy' ? setPrivacy(true) : setViewing(true))}
            >
              {part === 'privacy' ? t('privacy.title') : t('terms.title')}
            </button>
          ),
        )}
      </p>
      {/* 利用上の注意事項の確認の印。押すとポップアップを開き、「確認した」で入る。入った後は外せず、
          名前のリンクで開くポップアップに「確認した」は出ない */}
      <div className="flex items-center gap-2 has-disabled:opacity-50">
        <input
          type="checkbox"
          aria-label={t('terms.noticeCheckLabel')}
          checked={noticeSeen}
          disabled={noticeSeen}
          onChange={() => setNoticeOpen(true)}
        />
        <span>
          {tParts('terms.noticeCheck').map((part, index) =>
            index % 2 === 0 ? (
              part
            ) : (
              <button
                key={part}
                type="button"
                className={AGREEMENT_LINK}
                onClick={() => setNoticeOpen(true)}
              >
                {t('terms.noticeTitle')}
              </button>
            ),
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 has-disabled:opacity-50">
          <input
            type="checkbox"
            checked={accepted || consented}
            disabled={accepted}
            onChange={(event) => setConsented(event.target.checked)}
          />
          {t('terms.consent')}
        </label>
        <button
          type="button"
          className={dialogButton({ tone: 'primary' })}
          disabled={!noticeSeen || (!accepted && !consented)}
          onClick={() => {
            if (!accepted) accept();
            onStart?.();
          }}
        >
          {t('terms.accept')}
        </button>
      </div>
      <TermsViewDialog open={viewing} onOpenChange={setViewing} />
      <PrivacyDialog open={privacy} onOpenChange={setPrivacy} />
      {/* 注意事項のポップアップ。「確認した」で版と時刻を残す。× や Esc で閉じたら残さない。確認済みなら読むだけ */}
      <UsageNoticeDialog
        open={noticeOpen}
        onOpenChange={setNoticeOpen}
        onAcknowledge={
          noticeSeen
            ? undefined
            : () => {
                acknowledgeNotice();
                setNoticeOpen(false);
              }
        }
      />
    </div>
  );
}
