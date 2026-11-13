import { cva } from 'class-variance-authority';
import { CirclePlus } from 'lucide-react';
import { useState } from 'react';

import type { Playbook } from '@/chat/playbook';
import { addPhase, movePhase, savable } from '@/chat/playbook-draft';
import { ADVISOR_USES } from '@/chat/prompt-advisor';
import { ADD_BUTTON, LABEL } from '@/components/llm/playbook/playbook-editor-style';
import { ActionList } from '@/components/llm/playbook/PlaybookActionList';
import { PlaybookPhaseFields } from '@/components/llm/playbook/PlaybookPhaseFields';
import { SortableRow, SortableRows } from '@/components/llm/playbook/PlaybookSortable';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { FIELD_XS } from '@/components/ui/field';
import { t } from '@/i18n';
import { DIALOG_MIN } from '@/lib/dialog-rect';
import { newShortId } from '@/lib/id';
import { usePlaybooksStore } from '@/store/use-playbooks-store';

// ─────────────────────────────
// プレイブックを作る・直すダイアログ。直しかけを持ち、保存で自分のプレイブックに書く（写して作るは 1 冊足す）。
// ─────────────────────────────

const navRow = cva('w-full truncate rounded-md px-2 py-1 text-left text-sm', {
  variants: { selected: { true: 'bg-muted font-medium', false: 'hover:bg-muted' } },
});

/** 開く物。標準か自分のものを写して作るか、自分のものを直すか */
export type PlaybookEditing =
  | { readonly kind: 'copy'; readonly source: Playbook }
  | { readonly kind: 'edit'; readonly id: string };

/**
 * 左に「全体」とフェーズの並び、右に選んだ物の欄。開くたびに中身を作り直す（`key` に開いた物を渡す。
 * 直しかけを持ち越さない）
 */
export function PlaybookEditorDialog({
  editing,
  onClose,
}: {
  readonly editing: PlaybookEditing;
  readonly onClose: () => void;
}): React.ReactElement | null {
  const original = usePlaybooksStore((state) =>
    editing.kind === 'edit' ? state.playbooks[editing.id]?.playbook : undefined,
  );
  const initial: Playbook | undefined =
    editing.kind === 'copy'
      ? {
          ...editing.source,
          origin: 'own',
          name: t('llm.playbook.editor.copyName', { name: editing.source.name }),
        }
      : original;
  const [draft, setDraft] = useState<Playbook | undefined>(initial);
  // 右に出す物。全体（null）かフェーズの id
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);
  if (draft === undefined || initial === undefined) return null;
  const dirty = editing.kind === 'copy' || JSON.stringify(draft) !== JSON.stringify(initial);
  const phase = draft.phases.find((item) => item.id === selected);

  const save = (): void => {
    const store = usePlaybooksStore.getState();
    if (editing.kind === 'copy') store.add(draft);
    else store.update(editing.id, draft);
    onClose();
  };
  const requestClose = (): void => {
    if (dirty) setConfirmingClose(true);
    else onClose();
  };

  return (
    <DialogFrame
      id="chat-playbook-editor"
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      size="lg"
      movable
      embeddable={false}
      minSize={DIALOG_MIN}
      title={draft.name.trim().length > 0 ? draft.name : t('llm.playbook.editor.title')}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            className="flex shrink-0 flex-col gap-1 overflow-y-auto border-b p-2 sm:w-56 sm:border-r
              sm:border-b-0"
            aria-label={t('llm.playbook.phases')}
          >
            <button
              type="button"
              className={navRow({ selected: selected === null })}
              aria-current={selected === null ? 'true' : undefined}
              onClick={() => setSelected(null)}
            >
              {t('llm.playbook.editor.whole')}
            </button>
            <SortableRows
              ids={draft.phases.map((item) => item.id)}
              onMove={(from, to) => setDraft(movePhase(draft, from, to))}
            >
              {draft.phases.map((item) => (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  label={t('llm.playbook.editor.reorder', { name: item.name })}
                >
                  <button
                    type="button"
                    className={navRow({ selected: selected === item.id })}
                    aria-current={selected === item.id ? 'true' : undefined}
                    onClick={() => setSelected(item.id)}
                  >
                    {item.name.trim().length > 0 ? item.name : t('llm.playbook.untitled')}
                  </button>
                </SortableRow>
              ))}
            </SortableRows>
            <button
              type="button"
              className={ADD_BUTTON}
              onClick={() => {
                const id = newShortId();
                setDraft(addPhase(draft, id, newShortId()));
                setSelected(id);
              }}
            >
              <CirclePlus className="size-3.5" aria-hidden />
              {t('llm.playbook.editor.addPhase')}
            </button>
          </nav>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {phase === undefined ? (
              <>
                <label className={LABEL}>
                  {t('llm.playbook.editor.name')}
                  <input
                    className={FIELD_XS}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label className={LABEL}>
                  {t('llm.playbook.editor.description')}
                  <input
                    className={FIELD_XS}
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                </label>
                <label className={LABEL}>
                  {t('llm.playbook.editor.role')}
                  <textarea
                    className={`${FIELD_XS} field-sizing-content min-h-[4lh] resize-none`}
                    value={draft.role}
                    onChange={(event) => setDraft({ ...draft, role: event.target.value })}
                  />
                </label>
                {/* 入力欄の「続ける」で送る指示 */}
                <label className={LABEL}>
                  {t('llm.playbook.editor.continue')}
                  <textarea
                    className={`${FIELD_XS} field-sizing-content min-h-[2lh] resize-none`}
                    value={draft.continue}
                    onChange={(event) => setDraft({ ...draft, continue: event.target.value })}
                  />
                </label>
                {/* 決める段で開く構成の相談の用途 */}
                <label className={LABEL}>
                  {t('llm.playbook.editor.advisor')}
                  <select
                    className={FIELD_XS}
                    value={draft.advisor}
                    onChange={(event) => {
                      const advisor = ADVISOR_USES.find((use) => use === event.target.value);
                      if (advisor !== undefined) setDraft({ ...draft, advisor });
                    }}
                  >
                    {ADVISOR_USES.map((use) => (
                      <option key={use} value={use}>
                        {t(`llm.playbook.editor.advisors.${use}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <ActionList draft={draft} owner={null} onChange={setDraft} />
              </>
            ) : (
              <PlaybookPhaseFields
                draft={draft}
                phase={phase}
                onChange={setDraft}
                onRemoved={() => setSelected(null)}
              />
            )}
          </div>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t p-2">
          <button
            type="button"
            className={dialogButton({ tone: 'secondary' })}
            onClick={requestClose}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={dialogButton({ tone: 'primary' })}
            disabled={!savable(draft)}
            onClick={save}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
      <ConfirmDialog
        open={confirmingClose}
        title={t('common.unsaved.title')}
        description={t('common.unsaved.close')}
        confirmLabel={t('common.ok')}
        onConfirm={() => {
          setConfirmingClose(false);
          onClose();
        }}
        onCancel={() => setConfirmingClose(false)}
      />
    </DialogFrame>
  );
}
