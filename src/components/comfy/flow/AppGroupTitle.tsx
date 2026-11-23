import { useRef, useState } from 'react';

import type { AppInputGroup } from '@/graph/app-input-order';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { MENU_ACTION } from '@/lib/menu-actions';
import { entryKeyOf } from '@/lib/text-entry';

export function GroupTitle({
  group,
  onCommentChange,
}: {
  readonly group: AppInputGroup;
  readonly onCommentChange: (nodeId: NodeId, comment: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);
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
      autoFocus
      className="border-input bg-background min-w-0 flex-1 rounded border px-1
        focus:border-ring focus:outline-none"
      value={draft}
      placeholder={group.label}
      aria-label={t('flow.appInput.commentLabel', { name: group.label })}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
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
