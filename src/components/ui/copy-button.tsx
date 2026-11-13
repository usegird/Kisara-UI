import { cva } from 'class-variance-authority';
import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

import { t, type MessageKey } from '@/i18n';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 文字列の写し取り。**失敗したらそう出す**（許可されていない環境がある）。
// 層をまたいで使うので基盤の置き場に置く（同じ見た目のものを各層で作らない）。
// ─────────────────────────────

/** 写した結果ごとの文字 */
const COPY_TEXT = {
  idle: 'ui.copy.copy',
  copied: 'ui.copy.copied',
  failed: 'ui.copy.failed',
} as const satisfies Record<string, MessageKey>;

const copyButton = cva('hover:bg-muted flex shrink-0 items-center gap-1 rounded-md', {
  variants: {
    iconOnly: { true: 'p-1', false: 'px-1.5 py-0.5' },
    /** 見出しの横など、枠が要らないところ */
    frameless: {
      true: 'text-muted-foreground hover:text-foreground',
      false: 'border-input border',
    },
  },
});

/** 結果を出しておく時間 */
const FEEDBACK_MS = 1500;

/** 写し取りのボタンの props */
export interface CopyButtonProps {
  /** 写す文字列 */
  readonly text: string;
  /** 読み上げ用。「〜を写す」の形で渡す */
  readonly label: string;
  /** 絵だけにする（狭いところ用） */
  readonly iconOnly?: boolean | undefined;
  /** 枠を引かない */
  readonly frameless?: boolean | undefined;
  readonly className?: string | undefined;
}

/** 押すと文字列を写し、写せたか失敗したかを少しの間出す */
export function CopyButton({
  text,
  label,
  iconOnly = false,
  frameless = false,
  className,
}: CopyButtonProps): React.ReactElement {
  // 押すたびに新しい結果にする（続けて押したら、出しておく時間を最後に押した時点から数え直す）
  const [feedback, setFeedback] = useState<{ readonly ok: boolean } | null>(null);
  const state = copyStateOf(feedback);

  // 結果を戻す時計。外れたら止める（外れた後に状態を書かない）
  useEffect(() => {
    if (feedback === null) return;
    const timer = globalThis.setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => globalThis.clearTimeout(timer);
  }, [feedback]);

  const copy = async (): Promise<void> => {
    setFeedback({ ok: await copyText(text) });
  };

  return (
    <button
      type="button"
      className={cn(copyButton({ iconOnly, frameless }), className)}
      aria-label={label}
      title={label}
      onClick={(event) => {
        // カードの上に載ることがあるので、押しても下の操作を起こさない
        event.stopPropagation();
        void copy();
      }}
    >
      {state === 'copied' ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <Copy className="size-3" aria-hidden />
      )}
      {iconOnly ? null : t(COPY_TEXT[state])}
    </button>
  );
}

/** 写した結果の出し方。押していない・出し終えたなら idle */
function copyStateOf(feedback: { readonly ok: boolean } | null): keyof typeof COPY_TEXT {
  if (feedback === null) return 'idle';
  return feedback.ok ? 'copied' : 'failed';
}
