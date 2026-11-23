import { Trash2 } from 'lucide-react';

import { OUTLINE_VIEWS, type PhaseKind, type Playbook, type PlaybookPhase } from '@/chat/playbook';
import { removePhase, updatePhase } from '@/chat/playbook-draft';
import { ADD_BUTTON, LABEL } from '@/components/llm/playbook/playbook-editor-style';
import { ActionList } from '@/components/llm/playbook/PlaybookActionList';
import { FIELD_XS } from '@/components/ui/field';
import { t } from '@/i18n';

const KINDS: readonly PhaseKind[] = ['decide', 'proceed', 'close'];

export function PlaybookPhaseFields({
  draft,
  phase,
  onChange,
  onRemoved,
}: {
  readonly draft: Playbook;
  readonly phase: PlaybookPhase;
  readonly onChange: (next: Playbook) => void;
  readonly onRemoved: () => void;
}): React.ReactElement {
  return (
    <>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <label className={LABEL}>
          {t('llm.playbook.editor.phaseName')}
          <input
            className={FIELD_XS}
            value={phase.name}
            onChange={(event) =>
              onChange(updatePhase(draft, phase.id, { name: event.target.value }))
            }
          />
        </label>
        <label className={LABEL}>
          {t('llm.playbook.editor.phaseKind')}
          <select
            className={FIELD_XS}
            value={phase.kind}
            onChange={(event) => {
              const kind = KINDS.find((item) => item === event.target.value);
              if (kind !== undefined) onChange(updatePhase(draft, phase.id, { kind }));
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`llm.playbook.kind.${kind}`)}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          {t('llm.playbook.editor.outlineView')}
          <select
            className={FIELD_XS}
            value={phase.outline}
            onChange={(event) => {
              const outline = OUTLINE_VIEWS.find((item) => item === event.target.value);
              if (outline !== undefined) {
                onChange(updatePhase(draft, phase.id, { outline }));
              }
            }}
          >
            {OUTLINE_VIEWS.map((view) => (
              <option key={view} value={view}>
                {t(`llm.playbook.editor.outlineViews.${view}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-muted-foreground text-xs">
        {t(`llm.playbook.editor.scope.${phase.kind}`)}
      </p>
      <label className={LABEL}>
        {t('llm.playbook.editor.goal')}
        <input
          className={FIELD_XS}
          value={phase.goal}
          onChange={(event) => onChange(updatePhase(draft, phase.id, { goal: event.target.value }))}
        />
      </label>
      <ActionList draft={draft} owner={phase.id} onChange={onChange} />
      <button
        type="button"
        className={`${ADD_BUTTON} text-destructive hover:text-destructive`}
        disabled={draft.phases.length <= 1}
        onClick={() => {
          onChange(removePhase(draft, phase.id));
          onRemoved();
        }}
      >
        <Trash2 className="size-3.5" aria-hidden />
        {t('llm.playbook.editor.removePhase')}
      </button>
    </>
  );
}
