import { CirclePlus, X } from 'lucide-react';
import { useId, useState } from 'react';

import { DEFAULT_CHAR_NAME, DEFAULT_USER_NAME, normalizeVariableName } from '@/chat/macros';
import { isEmptyPersona } from '@/chat/prompt-parse';
import type { CharacterFields, ChatVariable, Persona } from '@/chat/types';
import { FIELD_XS } from '@/components/ui/field';
import { t } from '@/i18n';
import { newShortId } from '@/lib/id';
import { entryKeyOf } from '@/lib/text-entry';
import { editCharacter } from '@/store/chat/preset-import';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// カードの欄の「変数・置換」。見出しの行は行と同じ列に乗せるため、カードのほかの欄の見出しの部品は使わない。
// ─────────────────────────────

const ICON_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6
  shrink-0 items-center justify-center rounded`;

/**
 * 列は欄全体で 1 つのグリッドに持ち、行はそれを subgrid で使う。行ごとに別のグリッドにすると、
 * 「戻す」の列（auto）の幅が見出しの行では文字、ほかの行ではチェックで決まり、左端がずれる
 */
const COLUMNS = 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_1.5rem] gap-1';

const ROW = 'col-span-full grid grid-cols-subgrid items-center';

/** `{{user}}`・`{{char}}` の行と、自分で足した変数・戻すの行。直すと会話の写しに入る */
export function VariableRows({
  chatId,
  fields,
}: {
  readonly chatId: string;
  readonly fields: CharacterFields;
}): React.ReactElement {
  const persona = useChatStore((state) => state.chats[chatId]?.persona ?? null);
  const variables = fields.variables ?? [];
  const write = (next: readonly ChatVariable[]): void => editCharacter(chatId, { variables: next });
  const change = (id: string, patch: Partial<ChatVariable>): void =>
    write(variables.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  /** `{{user}}` は利用者の情報の名前。何も持たなくなれば利用者の情報を外す */
  const setPersona = (next: Persona): void => {
    useChatStore.getState().update(chatId, { persona: isEmptyPersona(next) ? null : next });
  };
  const user: Persona = persona ?? { name: '', description: '' };
  const headingId = useId();

  return (
    <section className={`${COLUMNS} px-1 text-xs`} aria-labelledby={headingId}>
      <div className={`${ROW} min-h-6`}>
        <h3 id={headingId} className="col-span-2 font-medium">
          {t('llm.prompt.card.variables')}
        </h3>
        <span className="text-muted-foreground">{t('llm.prompt.card.restoreVariable')}</span>
      </div>
      <NameRow
        macro="{{user}}"
        value={user.name}
        placeholder={DEFAULT_USER_NAME}
        onValue={(name) => setPersona({ ...user, name })}
      />
      <NameRow
        macro="{{char}}"
        value={fields.name}
        placeholder={DEFAULT_CHAR_NAME}
        onValue={(name) => editCharacter(chatId, { name })}
      />
      {variables.map((item) => (
        <div key={item.id} className={ROW}>
          {item.restore === true ? (
            // 戻すの行は左に元の文字（値）、右に送る文字（左の文字）を出す。保存の形は変えない
            <>
              <input
                className={FIELD_XS}
                value={item.value}
                placeholder={t('llm.prompt.card.restoreValueExample')}
                aria-label={t('llm.prompt.card.variableName')}
                onChange={(event) => change(item.id, { value: event.target.value })}
              />
              <VariableName
                value={item.name}
                restore
                label={t('llm.prompt.card.variableValue', { name: item.value })}
                onCommit={(name) => change(item.id, { name })}
              />
            </>
          ) : (
            <>
              <VariableName
                value={item.name}
                restore={false}
                label={t('llm.prompt.card.variableName')}
                onCommit={(name) => change(item.id, { name })}
              />
              <input
                className={FIELD_XS}
                value={item.value}
                aria-label={t('llm.prompt.card.variableValue', { name: item.name })}
                onChange={(event) => change(item.id, { value: event.target.value })}
              />
            </>
          )}
          <RestoreCheck
            name={item.restore === true ? item.value : item.name}
            checked={item.restore === true}
            onChange={(restore) =>
              write(
                variables.map((other) =>
                  other.id === item.id ? restoredRow(item, restore) : other,
                ),
              )
            }
          />
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label={t('llm.prompt.card.removeVariable', { name: item.name })}
            title={t('llm.prompt.card.removeVariable', { name: item.name })}
            onClick={() => write(variables.filter((other) => other.id !== item.id))}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={`${ICON_BUTTON} col-start-1`}
        aria-label={t('llm.prompt.card.addVariable')}
        title={t('llm.prompt.card.addVariable')}
        onClick={() => write([...variables, { id: newShortId(), name: '', value: '' }])}
      >
        <CirclePlus className="size-3.5" aria-hidden />
      </button>
    </section>
  );
}

/**
 * 戻すを入れ替えた行。保存の形は、置き換えの向きをそろえるため戻すの有無で変えない
 */
function restoredRow(item: ChatVariable, restore: boolean): ChatVariable {
  // 戻すの行は左に値・右に左の文字を出すので、左右の欄の文字が入れ替わらないように持ち替える
  const left = normalizeVariableName(restore ? item.name : item.value, restore);
  const right = restore ? item.value : item.name;
  return restore
    ? { id: item.id, name: right, value: left, restore: true }
    : { id: item.id, name: left, value: right };
}

/**
 * `{{user}}`・`{{char}}` の行。左は名前の印、右は名前（空なら薄く既定の名前）。戻すは淡くして押せなくし、
 * 指すと戻すの行を足すよう出す
 */
function NameRow({
  macro,
  value,
  placeholder,
  onValue,
}: {
  readonly macro: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onValue: (value: string) => void;
}): React.ReactElement {
  return (
    <div className={ROW}>
      <span className={`${FIELD_XS} text-muted-foreground`}>{macro}</span>
      <input
        className={FIELD_XS}
        value={value}
        placeholder={placeholder}
        aria-label={t('llm.prompt.card.variableValue', { name: macro })}
        onChange={(event) => onValue(event.target.value)}
      />
      <RestoreCheck name={macro} hint={t('llm.prompt.card.restoreNameHint')} checked={false} />
    </div>
  );
}

/**
 * 戻すのチェック。見出しの「戻す」の列に左を揃えて置き、指すと何をするかを出す。
 * `onChange` が無ければ淡くして押せなくする（`{{user}}`・`{{char}}`）
 */
function RestoreCheck({
  name,
  hint,
  checked,
  onChange,
}: {
  readonly name: string;
  /** 指したときの説明。無ければ自分で足した行の説明 */
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange?: (checked: boolean) => void;
}): React.ReactElement {
  return (
    <input
      type="checkbox"
      className="justify-self-start disabled:opacity-40"
      checked={checked}
      disabled={onChange === undefined}
      title={hint ?? t('llm.prompt.card.restoreVariableHint', { name })}
      aria-label={t('llm.prompt.card.restoreVariableOf', { name })}
      onChange={(event) => onChange?.(event.target.checked)}
    />
  );
}

/**
 * 左の文字（保存の形での名前）。打っている間はそのまま持ち、確定したときに `{{}}` を付けて書く。
 * 戻すの行は付けず（右の欄に出す送る文字）、空の欄には `{{}}` の無い例を薄く出す
 */
function VariableName({
  value,
  restore,
  label,
  onCommit,
}: {
  readonly value: string;
  readonly restore: boolean;
  readonly label: string;
  readonly onCommit: (name: string) => void;
}): React.ReactElement {
  // 打ちかけの名前（焦点がある間だけ）
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (): void => {
    if (draft === null) return;
    onCommit(normalizeVariableName(draft, restore));
    setDraft(null);
  };
  return (
    <input
      className={FIELD_XS}
      value={draft ?? value}
      placeholder={restore ? t('llm.prompt.card.restoreNameExample') : '{{name}}'}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (entryKeyOf(event) === 'commit') commit();
      }}
    />
  );
}
