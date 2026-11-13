import { ArrowLeftToLine, Pencil } from 'lucide-react';
import { useId, useState } from 'react';

import { EMPTY_CHARACTER } from '@/chat/card';
import { characterOf, chatLorebooks, chatNameSources } from '@/chat/chat-sources';
import { lorebookDictionary } from '@/chat/dictionary';
import { DICTIONARY_FILE_MAX_BYTES, readDictionaryFile } from '@/chat/dictionary-file';
import { isStreaming, sameExceptStreamingText } from '@/chat/edit';
import type { LoreEntry, OwnLorebook } from '@/chat/lore';
import { applyMacros } from '@/chat/macros';
import type { CharacterFields, Chat } from '@/chat/types';
import {
  pickDictionaryFiles,
  reportDictionaryImport,
} from '@/components/llm/dictionary/dictionary-files';
import { DictionaryDialog } from '@/components/llm/dictionary/DictionaryDialog';
import { StepSwitch } from '@/components/llm/message/StepSwitch';
import { ContentField } from '@/components/llm/prompt/PromptItemEditor';
import { VariableRows } from '@/components/llm/prompt/VariableRows';
import { SMALL_ICON_BUTTON, smallButton } from '@/components/ui/small-button';
import { useStableContent } from '@/hooks/ui/use-stable-content';
import { t } from '@/i18n';
import { isTooLarge } from '@/lib/file-size';
import { newShortId } from '@/lib/id';
import { editCharacter } from '@/store/chat/preset-import';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// プロンプトのタブの合計の下に置くカードの欄。どれも会話の写しに書く（プリセットへは保存で書く）。
// ─────────────────────────────

const BUTTON = smallButton();

/** 見出しの行のアイコン（会話の候補の切り替えと同じ大きさ） */
const HEADER_ICON = `text-muted-foreground hover:text-foreground hover:bg-muted inline-flex size-6
  items-center justify-center rounded disabled:pointer-events-none disabled:opacity-40`;

/** 欄（見出しはプロンプトの項目の名前と同じ大きさ。右に操作を置ける） */
function Field({
  title,
  actions,
  children,
}: {
  readonly title: string;
  readonly actions?: React.ReactNode;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const id = useId();
  return (
    <section className="flex flex-col gap-1 text-xs" aria-labelledby={id}>
      <div className="flex min-h-6 items-center justify-between gap-2 px-1">
        <h3 id={id} className="font-medium">
          {title}
        </h3>
        {actions === undefined ? null : <div className="flex items-center">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * 初期メッセージ（1 件目が最初の発言、2 件目からが別の挨拶）を 1 つの欄で切り替えて直す。
 * 欄が空なら › を押せない。最後の 1 件に本文があれば › で空の欄を開き、打つと新しい 1 件として足す。
 * 2 件目より後を空にして離れると、その 1 件を除く。右端のアイコンで直前の応答だったことにする
 */
function GreetingField({
  chat,
  chatId,
  fields,
}: {
  readonly chat: Chat;
  readonly chatId: string;
  readonly fields: CharacterFields;
}): React.ReactElement {
  const greetings = [fields.firstMes, ...fields.alternateGreetings];
  // 見ている位置と、› で開いた空の欄（まだ足していない）か（画面の中だけ）
  const [at, setAt] = useState(0);
  const [opened, setOpened] = useState(false);
  const count = greetings.length + (opened ? 1 : 0);
  const index = Math.min(at, count - 1);
  const text = greetings[index] ?? '';
  const streaming = isStreaming(chat);

  const write = (next: readonly string[]): void => {
    const [firstMes = '', ...alternateGreetings] = next;
    editCharacter(chatId, { firstMes, alternateGreetings });
  };
  const change = (value: string): void => {
    if (index < greetings.length) {
      write(greetings.map((item, position) => (position === index ? value : item)));
      return;
    }
    // 開いた空の欄に打ったら、新しい 1 件として足す
    if (value.length === 0) return;
    write([...greetings, value]);
    setOpened(false);
  };
  const step = (delta: -1 | 1): void => {
    let next = greetings;
    const target = index + delta;
    if (index >= greetings.length) {
      // 打たずに離れた空の欄は足さない
      setOpened(false);
    } else if (index > 0 && text.trim().length === 0) {
      // 空にした別の挨拶は、離れるときに除く
      next = greetings.filter((_, position) => position !== index);
      write(next);
    }
    if (target >= next.length) setOpened(true);
    setAt(Math.max(0, target));
  };
  /**
   * 初期メッセージを全部（`{{char}}`・`{{user}}` を置き換えて）候補に持つ直前の応答にし、見ている頁を
   * 選ぶ
   */
  const respond = (): void => {
    const sources = chatNameSources(fields, chat.persona);
    const contents = greetings.map((greeting) => applyMacros(greeting, sources));
    useChatStore.getState().respondWith(chatId, contents, index);
  };

  return (
    <Field
      title={t('llm.prompt.card.greeting')}
      actions={
        <>
          <StepSwitch
            index={index}
            count={count}
            nextDisabled={text.trim().length === 0}
            onStep={step}
          />
          <button
            type="button"
            className={HEADER_ICON}
            disabled={streaming || text.trim().length === 0}
            aria-label={t('llm.prompt.card.respond')}
            title={t('llm.prompt.card.respond')}
            onClick={respond}
          >
            <ArrowLeftToLine className="size-3.5" aria-hidden />
          </button>
        </>
      }
    >
      <ContentField value={text} label={t('llm.prompt.card.greeting')} onChange={change} />
    </Field>
  );
}

/**
 * 個別追加辞書（会話が持つ並び）。1 冊ずつの行と、並びの最後に 1 冊足す新規作成・jsonから開く
 */
function BookField({
  chat,
  chatId,
}: {
  readonly chat: Chat;
  readonly chatId: string;
}): React.ReactElement {
  // 辞書のダイアログで開いている冊の id
  const [editing, setEditing] = useState<string | null>(null);
  const books = chatLorebooks(chat);
  /** 会話の並びを書く（プリセットとほかの会話は変わらない） */
  const write = (next: readonly OwnLorebook[]): void => {
    useChatStore.getState().update(chatId, { lorebooks: next });
  };
  /** 1 冊を書き換える */
  const change = (id: string, patch: Partial<Omit<OwnLorebook, 'id'>>): void => {
    write(books.map((book) => (book.id === id ? { ...book, ...patch } : book)));
  };
  /** 並びの最後に 1 冊足す（今の辞書は置き換えない） */
  const append = (name: string, entries: readonly LoreEntry[]): string => {
    const id = `lorebook-${newShortId()}`;
    write([...books, { id, name, entries }]);
    return id;
  };
  const create = (): void => {
    setEditing(append(t('llm.extension.dictionary.newName'), []));
  };
  const open = (): void =>
    pickDictionaryFiles(false, async (file) => {
      // 丸ごと読む前に大きさを見る（巨大なファイルで画面を止めない）
      if (isTooLarge(file, DICTIONARY_FILE_MAX_BYTES)) {
        reportDictionaryImport({ kind: 'error', fileName: file.name, problem: 'size' });
        return;
      }
      const read = readDictionaryFile(file.name, await file.text());
      if (read.kind === 'error') {
        reportDictionaryImport({ kind: 'error', fileName: file.name, problem: read.problem });
        return;
      }
      append(read.name, read.entries);
      reportDictionaryImport({ kind: 'added', name: read.name, count: read.entries.length });
    });
  const edited = books.find((book) => book.id === editing);

  return (
    <Field title={t('llm.prompt.card.lore')}>
      {books.map((book) => (
        <BookRow
          key={book.id}
          book={book}
          // 名前は辞書の名前（空なら写したプリセットの名前。リンクに覚えた名前でプリセットは読まない）
          name={book.name || (chat.preset?.name ?? '')}
          onEnable={(enabled) => change(book.id, { off: enabled ? undefined : true })}
          onEdit={() => setEditing(book.id)}
        />
      ))}
      {/* 機能のタブと同じボタン */}
      <div className="flex gap-2 px-1">
        <button type="button" className={BUTTON} onClick={create}>
          {t('llm.extension.dictionary.create')}
        </button>
        <button type="button" className={BUTTON} onClick={open}>
          {t('llm.extension.dictionary.import')}
        </button>
      </div>
      {edited === undefined ? null : (
        // 機能のタブと同じ辞書のダイアログ。書く先は会話のその 1 冊
        <DictionaryDialog
          key={edited.id}
          dictionary={{
            ...lorebookDictionary(edited),
            name: edited.name || (chat.preset?.name ?? ''),
          }}
          onSave={({ name, entries, scanDepth }) => change(edited.id, { name, entries, scanDepth })}
          onRemove={() => write(books.filter((book) => book.id !== edited.id))}
          onClose={() => setEditing(null)}
        />
      )}
    </Field>
  );
}

/** 個別追加辞書の 1 冊の行。機能のタブの辞書の 1 行と同じ形。チェックはこの会話で当てるか（会話に持つ） */
function BookRow({
  book,
  name,
  onEnable,
  onEdit,
}: {
  readonly book: OwnLorebook;
  readonly name: string;
  readonly onEnable: (enabled: boolean) => void;
  readonly onEdit: () => void;
}): React.ReactElement {
  const loreOn = useSettingsStore((state) => state.loreDictionariesOn);
  return (
    <div className="flex items-start gap-1 px-1">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={book.off !== true}
        // 動的追加辞書を切っている間は当てないので押せない
        disabled={!loreOn}
        aria-label={t('llm.prompt.card.loreEnable', { name })}
        onChange={(event) => onEnable(event.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate">{name}</p>
        <p className="text-muted-foreground truncate">
          {t('llm.extension.dictionary.entries', { count: book.entries.length })}
        </p>
      </div>
      <button
        type="button"
        className={SMALL_ICON_BUTTON}
        aria-label={t('llm.extension.dictionary.view', { name })}
        title={t('llm.extension.dictionary.view', { name })}
        onClick={onEdit}
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/** 送る中身の項目に入らないカードの欄（コメント・初期メッセージ・変数・個別追加辞書）を縦に並べる */
export function CardFieldsSection({
  chatId,
}: {
  readonly chatId: string;
}): React.ReactElement | null {
  // 受け取り中は届く語ごとに会話が作り直される。欄が使わない受け取り中の本文だけの違いなら
  // 前の会話のまま描き、欄まで描き直さない
  const chat = useStableContent(
    useChatStore((state) => state.chats[chatId]),
    sameExceptStreamingText,
  );
  // プリセットとリンクしていない会話でも出す
  if (chat === undefined) return null;
  const fields = characterOf(chat) ?? EMPTY_CHARACTER;

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <Field title={t('llm.prompt.card.notes')}>
        <ContentField
          value={fields.creatorNotes}
          label={t('llm.prompt.card.notes')}
          onChange={(creatorNotes) => editCharacter(chatId, { creatorNotes })}
        />
      </Field>
      {/* 会話を替えたら位置を初めに戻す */}
      <GreetingField key={chatId} chat={chat} chatId={chatId} fields={fields} />
      {/* 見出しの行に「戻す」を並べるので、見出しは変数の行の部品が持つ */}
      <VariableRows chatId={chatId} fields={fields} />
      <BookField chat={chat} chatId={chatId} />
    </div>
  );
}
