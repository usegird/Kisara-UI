import { useRef, useState } from 'react';

import type { AppInputGroup } from '@/graph/app-input-order';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { entryKeyOf } from '@/lib/text-entry';

// ─────────────────────────────
// アプリ入力の枠の見出しのコメント。打ちかけの値はここに持つ
// ─────────────────────────────

/**
 * 枠の見出しのコメント。押すとその場で入力欄に変わる。
 * 書き戻し先はカードのコメントと同じ `title`。空にするとノード名に戻る
 */
export function GroupTitle({
  group,
  onCommentChange,
}: {
  readonly group: AppInputGroup;
  readonly onCommentChange: (nodeId: NodeId, comment: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
  // Esc でやめたとき、続いて来る blur で書き戻さない
  const cancelled = useRef(false);

  if (draft === null) {
    return (
      <button
        type="button"
        className="hover:bg-muted min-w-0 truncate rounded px-0.5 text-left"
        title={t('flow.appInput.editCommentTitle', { name: group.label })}
        aria-label={t('flow.appInput.editCommentLabel', { name: group.label })}
        {...MENU_ACTION}
        onClick={() => {
          cancelled.current = false;
          setDraft(group.comment);
        }}
      >
        {group.label}
      </button>
    );
  }

  const commit = (): void => {
    if (!cancelled.current && draft !== group.comment) onCommentChange(group.nodeId, draft);
    setDraft(null);
  };

  return (
    <input
      // 押した直後に書けるようにする（押した操作の続き）
      autoFocus
      className="border-input bg-background min-w-0 flex-1 rounded border px-1
        focus:border-ring focus:outline-none"
      value={draft}
      placeholder={group.label}
      aria-label={t('flow.appInput.commentLabel', { name: group.label })}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // 列の Ctrl+Z（入れた値の取り消し）へ渡さない。入力欄の中の取り消しに任せる
        event.stopPropagation();
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
