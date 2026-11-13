import { CirclePlus, Trash2 } from 'lucide-react';

import type { Playbook } from '@/chat/playbook';
import {
  addAction,
  moveAction,
  removeAction,
  updateAction,
  type ActionOwner,
} from '@/chat/playbook-draft';
import { ADD_BUTTON } from '@/components/llm/playbook/playbook-editor-style';
import { PlaybookActionFields } from '@/components/llm/playbook/PlaybookActionFields';
import { SortableRow, SortableRows } from '@/components/llm/playbook/PlaybookSortable';
import { t } from '@/i18n';
import { newShortId } from '@/lib/id';

// ─────────────────────────────
// プレイブックを作る・直すダイアログの操作の並び。
// ─────────────────────────────

/** 操作の並び（フェーズの操作か常設の操作）。掴んで並べ替え、足す・消す */
export function ActionList({
  draft,
  owner,
  onChange,
}: {
  readonly draft: Playbook;
  readonly owner: ActionOwner;
  readonly onChange: (next: Playbook) => void;
}): React.ReactElement {
  const actions =
    owner === null
      ? draft.standing
      : (draft.phases.find((phase) => phase.id === owner)?.actions ?? []);
  return (
    <section className="flex flex-col gap-1.5" aria-label={t('llm.playbook.editor.actions')}>
      <h3 className="text-muted-foreground text-xs">
        {owner === null ? t('llm.playbook.standing') : t('llm.playbook.editor.actions')}
      </h3>
      <SortableRows
        ids={actions.map((action) => action.id)}
        onMove={(from, to) => onChange(moveAction(draft, owner, from, to))}
      >
        {actions.map((action) => (
          <SortableRow
            key={action.id}
            id={action.id}
            label={t('llm.playbook.editor.reorder', { name: action.name })}
          >
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <PlaybookActionFields
                  draft={draft}
                  action={action}
                  sendOnly={owner === null}
                  onChange={(next) => onChange(updateAction(draft, owner, action.id, next))}
                />
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive mt-1 rounded p-1
                  disabled:pointer-events-none disabled:opacity-40"
                aria-label={t('llm.playbook.editor.removeAction', { name: action.name })}

                onClick={() => onChange(removeAction(draft, owner, action.id))}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </SortableRow>
        ))}
      </SortableRows>
      <button
        type="button"
        className={ADD_BUTTON}
        onClick={() => onChange(addAction(draft, owner, newShortId()))}
      >
        <CirclePlus className="size-3.5" aria-hidden />
        {t('llm.playbook.editor.addAction')}
      </button>
    </section>
  );
}
