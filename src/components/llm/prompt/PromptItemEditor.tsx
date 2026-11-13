import type { LoreEntry } from '@/chat/lore';
import { updatePrefill, updatePromptItem, type PromptItemPatch } from '@/chat/prompt';
import type { PromptItem } from '@/chat/types';
import { clipWidth, type AdditionalInfoRow } from '@/components/llm/prompt/additional-info-rows';
import { SummarizeButton } from '@/components/llm/prompt/ChatSummaryField';
import type { ItemSummary } from '@/components/llm/prompt/PromptItemCard';
import { FIELD_XS } from '@/components/ui/field';
import { t } from '@/i18n';
import { editCharacter } from '@/store/chat/preset-import';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// プロンプトの項目を開いたときの中身。カードの中でそのまま直し、打つたびに構成に効く。
// ─────────────────────────────

function edit(chatId: string, itemId: string, patch: PromptItemPatch): void {
  useChatStore.getState().updatePrompt(chatId, (prompt) => updatePromptItem(prompt, itemId, patch));
}

/** 開いた項目の中身の props */
export interface PromptItemEditorProps {
  readonly chatId: string;
  readonly item: PromptItem;
  /** 一覧に出している補足（印の中身・カードの欄・ロアブック） */
  readonly summary: ItemSummary;
}

/** 項目の印に応じた中身（履歴・メッセージ・利用者の情報・追加辞書・カードの欄・本文の欄）を出す */
export function PromptItemEditor({
  chatId,
  item,
  summary,
}: PromptItemEditorProps): React.ReactElement {
  const card = summary.card;
  return (
    <div className="flex flex-col gap-1 pt-1">
      {item.marker === 'chatHistory' ? (
        <HistoryRows chatId={chatId} rows={summary.lore} />
      ) : item.marker === 'currentInput' ? (
        <CurrentInputView chatId={chatId} />
      ) : item.marker === 'personaDescription' ? (
        <PersonaFields chatId={chatId} item={item} />
      ) : item.marker === 'additionalInfo' ? (
        <LoreList lore={summary.lore} />
      ) : card !== null ? (
        // プリセットの欄は会話の写しだけを直す（プリセットは変えない）
        <ContentField
          value={card.value}
          onChange={(value) => editCharacter(chatId, { [card.field]: value })}
        />
      ) : item.marker === null ? (
        <ContentField
          value={item.content}
          onChange={(content) => edit(chatId, item.id, { content })}
        />
      ) : summary.source.trim().length > 0 ? (
        <p className="bg-muted/50 max-h-48 overflow-auto rounded-md px-2 py-1 whitespace-pre-wrap">
          {summary.source}
        </p>
      ) : summary.note.length > 0 ? (
        <p className="text-muted-foreground">{summary.note}</p>
      ) : null}
      {item.position.kind === 'depth' ? <DepthField chatId={chatId} item={item} /> : null}
    </div>
  );
}

/** 履歴の中に差し込む項目の深さ（末尾から何件目の後ろか。0 は最後の発言の後） */
function DepthField({
  chatId,
  item,
}: {
  readonly chatId: string;
  readonly item: PromptItem;
}): React.ReactElement | null {
  if (item.position.kind !== 'depth') return null;
  const { order } = item.position;
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{t('llm.prompt.depthValue')}</span>
      <input
        type="number"
        min={0}
        className={`${FIELD_XS} w-14`}
        value={item.position.depth}
        onChange={(event) =>
          edit(chatId, item.id, {
            position: {
              kind: 'depth',
              depth: Math.max(0, Math.trunc(event.target.valueAsNumber || 0)),
              order,
            },
          })
        }
      />
    </label>
  );
}

/**
 * システムプロンプト（全体の設定）の本文の欄
 */
export function SystemPromptEditor({ content }: { readonly content: string }): React.ReactElement {
  return (
    <ContentField
      value={content}
      onChange={(text) => useSettingsStore.getState().setLlmSystemPrompt(text)}
    />
  );
}

/**
 * プレフィルの空の欄に薄く出す例。空の欄で Tab を押すとそのまま入る（接続先の欄と同じ）。会話の
 * プリセットなどで変えない（どの会話でも同じ例）
 */
const PREFILL_EXAMPLE = '<response>';

/** プレフィルを開いたときの中身 */
export function PrefillEditor({
  chatId,
  content,
}: {
  readonly chatId: string;
  readonly content: string;
}): React.ReactElement {
  const set = (next: string): void => {
    useChatStore
      .getState()
      .updatePrompt(chatId, (prompt) => updatePrefill(prompt, { content: next }));
  };
  return (
    <div className="flex flex-col gap-1 pt-1">
      <p className="text-muted-foreground">{t('llm.prompt.prefillHint')}</p>
      <ContentField
        value={content}
        placeholder={PREFILL_EXAMPLE}
        onChange={set}
        onKeyDown={(event) => {
          if (event.key !== 'Tab' || event.shiftKey || content.length > 0) return;
          event.preventDefault();
          set(PREFILL_EXAMPLE);
        }}
      />
    </div>
  );
}

/** 本文の欄の props */
export interface ContentFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string | undefined;
  readonly onKeyDown?: ((event: React.KeyboardEvent<HTMLTextAreaElement>) => void) | undefined;
  /** 欄の名前（読み上げ用）。無ければ「本文」 */
  readonly label?: string | undefined;
}

/** 本文の欄。見積もったトークン数は見出しの行に出すので、ここには出さない */
export function ContentField({
  value,
  onChange,
  placeholder,
  onKeyDown,
  label,
}: ContentFieldProps): React.ReactElement {
  return (
    <textarea
      className={`${FIELD_XS} field-sizing-content max-h-80 min-h-20 w-full resize-y font-mono
        leading-relaxed`}
      value={value}
      placeholder={placeholder}
      aria-label={label ?? t('llm.prompt.content')}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * 利用者の情報（この会話だけ）。説明はこの項目に入る。名前（`{{user}}`）はカードの欄の変数で直す。
 * 説明を空から書き始めたら、項目も有効にする（書いたのに送られないことが無いように）
 */
function PersonaFields({
  chatId,
  item,
}: {
  readonly chatId: string;
  readonly item: PromptItem;
}): React.ReactElement {
  const persona = useChatStore((state) => state.chats[chatId]?.persona ?? null);
  const name = persona?.name ?? '';
  const description = persona?.description ?? '';
  const set = (patch: { description: string }): void => {
    const next = { name, ...patch };
    const store = useChatStore.getState();
    const empty = next.name.length === 0 && next.description.length === 0;
    store.update(chatId, { persona: empty ? null : next });
    if (description.length === 0 && next.description.length > 0 && !item.enabled) {
      store.updatePrompt(chatId, (prompt) => updatePromptItem(prompt, item.id, { enabled: true }));
    }
  };
  return <ContentField value={description} onChange={(next) => set({ description: next })} />;
}

/** 行を指したときに出す、項目の中身（辞書名・トリガーワードか追加条件・追加内容。省かない） */
function entryTip(dictionary: string, entry: LoreEntry): string {
  const lines = [t('llm.prompt.lore.tip.dictionary', { value: dictionary })];
  if (entry.keys.length > 0) {
    lines.push(t('llm.prompt.lore.tip.trigger', { value: entry.keys.join(', ') }));
  }
  if (entry.secondaryKeys.length > 0) {
    const logic = t(`llm.dictionary.logic.${entry.logic}`);
    const value = entry.secondaryKeys.join(', ');
    lines.push(t('llm.prompt.lore.tip.condition', { logic, value }));
  }
  lines.push(t('llm.prompt.lore.tip.content', { value: entry.content }));
  return lines.join('\n');
}

/**
 * 追加辞書の 1 行。`辞書名: 本文 (role)`。辞書名は半角 10 文字まで、本文は 1 行に収まらない分を省く。
 * 当て方で見た目を変えない。指すと中身を省かずに出す
 */
function LoreRow({
  row,
  trailing,
}: {
  readonly row: AdditionalInfoRow;
  /** 「履歴 N 件」の行の右端に置くもの（要約する） */
  readonly trailing?: React.ReactNode;
}): React.ReactElement {
  if (row.kind === 'history') {
    return (
      <li className="bg-muted/50 flex items-start justify-between gap-2 rounded-md px-2 py-0.5 tabular-nums">
        <span>{t('llm.prompt.source.messages', { count: row.count })}</span>
        {trailing}
      </li>
    );
  }
  if (row.kind === 'message') {
    return (
      <li className="bg-muted/50 rounded-md px-2 py-0.5">{t('llm.prompt.items.currentInput')}</li>
    );
  }
  return (
    <li
      className="bg-muted/50 flex min-w-0 items-baseline gap-1 rounded-md px-2 py-0.5"
      title={entryTip(row.dictionary, row.entry)}
    >
      <span className="shrink-0 font-medium">{clipWidth(row.dictionary)}:</span>
      <span className="min-w-0 flex-1 truncate">{row.entry.content}</span>
      <span className="text-muted-foreground shrink-0">({row.role})</span>
    </li>
  );
}

/** 追加辞書の一覧（追加辞書の印に入る項目）。読むだけ */
function LoreList({ lore }: { readonly lore: ItemSummary['lore'] }): React.ReactElement {
  if (!lore.some((row) => row.kind === 'entry')) {
    return (
      <ul className="flex flex-col gap-0.5">
        {lore.map((row) => (
          <LoreRow key={row.key} row={row} />
        ))}
        <li className="text-muted-foreground px-2">{t('llm.prompt.lore.none')}</li>
      </ul>
    );
  }
  return (
    <ul className="flex max-h-64 flex-col gap-0.5 overflow-auto">
      {lore.map((row) => (
        <LoreRow key={row.key} row={row} />
      ))}
    </ul>
  );
}

/**
 * 会話履歴の中身。「履歴 N 件」の行と、その上下に追加辞書から差し込む項目を送る順に並べる
 * （トークン数は見出しの行に出す。要約はこの上のセッション要約の行に出す）
 */
function HistoryRows({
  chatId,
  rows,
}: {
  readonly chatId: string;
  readonly rows: ItemSummary['lore'];
}): React.ReactElement {
  const first = rows.find((row) => row.kind === 'history');
  return (
    <>
      <ul className="flex max-h-64 flex-col gap-0.5 overflow-auto">
        {rows.map((row) =>
          row === first ? (
            <LoreRow key={row.key} row={row} trailing={<SummarizeButton chatId={chatId} />} />
          ) : (
            <LoreRow key={row.key} row={row} />
          ),
        )}
      </ul>
      {first === undefined ? (
        <div className="flex justify-end">
          <SummarizeButton chatId={chatId} />
        </div>
      ) : null}
    </>
  );
}

/** メッセージの中身。会話の入力欄に打ちかけている本文を、欄の枠を付けずに文字のまま写す */
function CurrentInputView({ chatId }: { readonly chatId: string }): React.ReactElement {
  const draft = useChatStore((state) => state.drafts[chatId] ?? '');
  return (
    <p
      className="text-muted-foreground px-2 leading-relaxed break-words whitespace-pre-wrap"
      aria-label={t('llm.prompt.items.currentInput')}
    >
      {draft}
    </p>
  );
}
