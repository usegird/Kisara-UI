import { DialogFrame } from '@/components/ui/dialog';
import { useNarrowScreen } from '@/hooks/ui/use-narrow-screen';

// ─────────────────────────────
// 読む文書のダイアログと本文。規約・ポリシー・注意・アクセシビリティ方針で共通の枠と見た目。
// ─────────────────────────────

/** 文書の名前のリンク（押すと全文のダイアログを開く） */
export const AGREEMENT_LINK = 'text-foreground underline underline-offset-2 hover:opacity-80';

/** 本文の文字（確認ダイアログの説明の欄と同じ大きさ・色。利用上の注意事項に揃える） */
export const DOCUMENT_TEXT_CLASS =
  'text-muted-foreground flex flex-col gap-2 text-xs leading-relaxed';

/** 動かして縮めるときの最小（狭めの画面でも収まる大きさ） */
const DOCUMENT_MIN = { width: 360, height: 320 };

/**
 * 本文の中の URL。括弧（全角・半角）と空白で終わる。分けた結果の奇数番目が URL になるよう、
 * 全体を 1 つの組にする
 */
const URL_PATTERN = /(https:\/\/[^\s()（）]+)/;

/** 読む文書のダイアログの props */
export interface DocumentDialogProps {
  /** 位置と大きさを端末に残す名前。文書ごとに 1 つ */
  readonly id: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** 動かす前の幅を広くとる（条文の長い利用規約・プライバシーポリシー） */
  readonly wide?: boolean | undefined;
  readonly children: React.ReactNode;
}

/**
 * 読む文書のダイアログ。いつも自由移動で、帯を掴んで動かし四辺と四隅で大きさを変える。
 * 幅 768px 未満では動かさず中央に置き、640px 未満では画面いっぱいに出す。
 * 本文は焦点を受けて矢印キーで送れる
 */
export function DocumentDialog({
  id,
  open,
  onOpenChange,
  title,
  wide = false,
  children,
}: DocumentDialogProps): React.ReactElement {
  const narrow = useNarrowScreen();
  return (
    <DialogFrame
      id={id}
      open={open}
      onOpenChange={onOpenChange}
      size={wide ? 'documentWide' : 'document'}
      embeddable={false}
      movable={!narrow}
      minSize={DOCUMENT_MIN}
      fullOnNarrow
      title={title}
    >
      <div
        tabIndex={0}
        role="region"
        aria-label={title}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {children}
      </div>
    </DialogFrame>
  );
}

/** 文書の本文の props */
export interface DocumentBodyProps {
  /** 本文。空行で段落に分ける */
  readonly text: string;
  /** 末尾に置く版と効力が生じる日 */
  readonly footer?: string | undefined;
}

/**
 * 規約・ポリシー・注意の本文。空行で段落に分け、末尾に版と効力が生じる日を置く。
 * 本文の URL は新しいタブで開くリンクにする
 */
export function DocumentBody({ text, footer }: DocumentBodyProps): React.ReactElement {
  const paragraphs = text.split('\n\n');
  return (
    <div className={DOCUMENT_TEXT_CLASS}>
      {paragraphs.map((paragraph, index) => (
        // 固定の文面で並べ替えないので、段落の位置で見分ける
        <p key={index} className="whitespace-pre-wrap">
          <LinkedText text={paragraph} />
        </p>
      ))}
      {footer === undefined ? null : <p className="mt-2">{footer}</p>}
    </div>
  );
}

/** 文の中の URL だけをリンクにする */
function LinkedText({ text }: { readonly text: string }): React.ReactElement {
  return (
    <>
      {text.split(URL_PATTERN).map((part, index) =>
        // 固定の文面の中の位置で見分ける（並べ替えない）
        index % 2 === 0 ? (
          part
        ) : (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={AGREEMENT_LINK}
          >
            {part}
          </a>
        ),
      )}
    </>
  );
}
