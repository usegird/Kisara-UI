import type { Playbook, PlaybookAction, PlaybookSendAction, ResponseUse } from '@/chat/playbook';
import { withActionKind } from '@/chat/playbook-draft';
import { FIELD_XS } from '@/components/ui/field';
import { t } from '@/i18n';

// ─────────────────────────────
// プレイブックを作るダイアログの、操作 1 件の欄。
// ─────────────────────────────

const LABEL = 'text-muted-foreground flex flex-col gap-1 text-xs';

const KINDS: readonly PlaybookAction['kind'][] = ['send', 'consult', 'next'];
const USES: readonly (ResponseUse | 'none')[] = ['none', 'send'];

/** 送るの操作の、使い道を除いた項目 */
function sendBase(action: PlaybookSendAction): PlaybookSendAction {
  const { kind, id, name, instruction } = action;
  return { kind, id, name, instruction };
}

/** 操作の名前・種類と、種類ごとの項目（送るなら指示と使い道、相談なら初めの文と勘所）の欄 */
export function PlaybookActionFields({
  draft,
  action,
  sendOnly,
  onChange,
}: {
  readonly draft: Playbook;
  readonly action: PlaybookAction;
  /** 送るの操作だけにする（常設の操作） */
  readonly sendOnly: boolean;
  readonly onChange: (next: PlaybookAction) => void;
}): React.ReactElement {
  const sends = draft.phases
    .flatMap((phase) => phase.actions)
    .filter((item) => item.kind === 'send' && item.id !== action.id);
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className={LABEL}>
          {t('llm.playbook.editor.actionName')}
          <input
            className={FIELD_XS}
            value={action.name}
            onChange={(event) => onChange({ ...action, name: event.target.value })}
          />
        </label>
        <label className={LABEL}>
          {t('llm.playbook.editor.actionKind')}
          <select
            className={FIELD_XS}
            value={action.kind}
            onChange={(event) => {
              const kind = KINDS.find((item) => item === event.target.value);
              if (kind !== undefined) onChange(withActionKind(action, kind));
            }}
          >
            {(sendOnly ? KINDS.slice(0, 1) : KINDS).map((kind) => (
              <option key={kind} value={kind}>
                {t(`llm.playbook.editor.kinds.${kind}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {action.kind === 'send' ? (
        <>
          <label className={LABEL}>
            {t('llm.playbook.editor.instruction')}
            <textarea
              className={`${FIELD_XS} field-sizing-content min-h-[4lh] resize-none`}
              value={action.instruction}
              onChange={(event) => onChange({ ...action, instruction: event.target.value })}
            />
          </label>
          {/* 入力欄に入れる操作は使い道を持たない */}
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={action.revise === true}
              onChange={(event) =>
                onChange(
                  event.target.checked ? { ...sendBase(action), revise: true } : sendBase(action),
                )
              }
            />
            {t('llm.playbook.editor.revise')}
          </label>
          {action.revise === true ? null : (
            <div className="flex flex-wrap items-end gap-3">
              <label className={LABEL}>
                {t('llm.playbook.editor.use')}
                <select
                  className={FIELD_XS}
                  value={action.use ?? 'none'}
                  onChange={(event) => {
                    const use = USES.find((item) => item === event.target.value) ?? 'none';
                    const rest = sendBase(action);
                    onChange(use === 'none' ? rest : { ...rest, use });
                  }}
                >
                  {USES.map((use) => (
                    <option key={use} value={use}>
                      {t(`llm.playbook.editor.uses.${use}`)}
                    </option>
                  ))}
                </select>
              </label>
              {action.use === 'send' ? (
                <label className={LABEL}>
                  {t('llm.playbook.editor.sendTo')}
                  <select
                    className={FIELD_XS}
                    value={action.sendTo ?? ''}
                    onChange={(event) => {
                      // 空は続けるの指示で送る
                      const sendTo = event.target.value;
                      const rest = { ...sendBase(action), use: 'send' as const };
                      onChange(sendTo.length === 0 ? rest : { ...rest, sendTo });
                    }}
                  >
                    <option value="">{t('llm.playbook.continueSend')}</option>
                    {sends.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}
          {action.use === 'send' &&
          action.sendTo !== undefined &&
          !sends.some((item) => item.id === action.sendTo) ? (
            <p className="text-destructive text-xs">{t('llm.playbook.editor.noSendTo')}</p>
          ) : null}
        </>
      ) : null}
      {action.kind === 'consult' ? (
        <>
          <label className={LABEL}>
            {t('llm.playbook.editor.greeting')}
            <textarea
              className={`${FIELD_XS} field-sizing-content min-h-[2lh] resize-none`}
              value={action.greeting}
              onChange={(event) => onChange({ ...action, greeting: event.target.value })}
            />
          </label>
          <label className={LABEL}>
            {t('llm.playbook.editor.guide')}
            <textarea
              className={`${FIELD_XS} field-sizing-content min-h-[4lh] resize-none`}
              value={action.instruction}
              onChange={(event) => onChange({ ...action, instruction: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={action.outline}
              onChange={(event) => onChange({ ...action, outline: event.target.checked })}
            />
            {t('llm.playbook.editor.writesOutline')}
          </label>
        </>
      ) : null}
    </div>
  );
}
