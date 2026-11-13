import { useRef, useState } from 'react';

import type { NodeView } from '@/graph/rows';
import { t } from '@/i18n';
import { caretOffsetAt } from '@/lib/caret-from-point';
import { MENU_ACTION } from '@/lib/menu-actions';
import { entryKeyOf } from '@/lib/text-entry';

// ─────────────────────────────
// 見出しのコメント（`title`）。押したときだけ入力欄に変える。
// 外部でコメントが変わったら、置く側が `key` で作り直す（描画中の state 同期を避ける）。
// ─────────────────────────────

/** 見出しのコメントの受け取り物 */
export interface CommentFieldProps {
  readonly view: NodeView;
  /** 無ければ読むだけ */
  readonly onCommentChange?: ((id: number, comment: string) => void) | undefined;
}

/** コメントを出し、押すと押した位置にキャレットを置いた入力欄に変える */
export function CommentField({ view, onCommentChange }: CommentFieldProps): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  // 入力欄に変えたあと、最初に置くキャレットの位置
  const caret = useRef<number | null>(null);
  // Esc でやめたとき、続いて来る blur で書き戻さない
  const cancelled = useRef(false);
  const text = useRef<HTMLSpanElement>(null);

  if (!onCommentChange) {
    return (
      <span className="text-foreground/75 min-w-0 flex-1 truncate text-2xs">
        {view.comment.length > 0 ? view.comment : t('flow.comment.none')}
      </span>
    );
  }

  if (draft === null) {
    const empty = view.comment.length === 0;
    return (
      <button
        type="button"
        className="text-foreground/75 hover:border-input min-w-0 flex-1 cursor-text truncate
          rounded border border-transparent pr-1 pl-px text-left text-2xs"
        title={empty ? t('flow.comment.emptyTitle') : view.comment}
        aria-label={t('flow.comment.editLabel', { name: view.displayName })}
        // Tab で止めず、キーボードで開くメニューから届く
        {...MENU_ACTION}
        onClick={(event) => {
          // キーで押したとき（位置を持たない）は末尾
          const at =
            event.detail === 0 || empty || text.current === null
              ? null
              : caretOffsetAt(text.current, event.clientX, event.clientY);
          caret.current = at ?? view.comment.length;
          cancelled.current = false;
          setDraft(view.comment);
        }}
      >
        {empty ? (
          <span className="text-muted-foreground">{t('flow.comment.write')}</span>
        ) : (
          <span ref={text}>{view.comment}</span>
        )}
      </button>
    );
  }

  const commit = (): void => {
    if (!cancelled.current && draft !== view.comment) onCommentChange(view.id, draft);
    setDraft(null);
  };

  return (
    <input
      // 押した操作の続きで書けるよう、現れたらすぐ焦点を当ててキャレットを置く
      ref={(element) => {
        const at = caret.current;
        if (element === null || at === null) return;
        caret.current = null;
        element.focus();
        element.setSelectionRange(at, at);
      }}
      className="text-foreground/75 placeholder:text-muted-foreground border-input min-w-0 flex-1
        rounded border bg-transparent
        pr-1 pl-px text-2xs focus:border-ring focus:outline-none"
      value={draft}
      placeholder={t('flow.comment.write')}
      aria-label={t('flow.comment.label', { name: view.displayName })}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        const key = entryKeyOf(event);
        if (key === 'commit') event.currentTarget.blur();
        if (key === 'cancel') {
          cancelled.current = true;
          setDraft(null);
        }
      }}
    />
  );
}
