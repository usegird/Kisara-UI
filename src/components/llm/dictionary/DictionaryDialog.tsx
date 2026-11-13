import { arrayMove } from '@dnd-kit/sortable';
import { CirclePlus, Download, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';

import { blankDictionaryEntry, sameEntries, type Dictionary } from '@/chat/dictionary';
import { DEFAULT_SCAN_DEPTH, type LoreEntry } from '@/chat/lore';
import { PLAYBOOK_BOOK, withStepKeys } from '@/chat/playbook-outline';
import { isReservedBookName, RESERVED_BOOK_PREFIX } from '@/chat/reserved-book';
import { worldInfoJson } from '@/chat/world-info';
import { ENTRY_GRID, ENTRY_LEAD } from '@/components/llm/dictionary/dictionary-entry-grid';
import { DictionaryEntryList } from '@/components/llm/dictionary/DictionaryEntryList';
import { DictionaryNumberField } from '@/components/llm/dictionary/DictionaryNumberField';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DialogFrame } from '@/components/ui/dialog';
import { dialogButton } from '@/components/ui/dialog-button';
import { DialogToolbar } from '@/components/ui/dialog-toolbar';
import { EMPTY_NOTICE_CLASS } from '@/components/ui/empty-notice';
import { FIELD_XS } from '@/components/ui/field';
import { SearchField } from '@/components/ui/search-field';
import { t } from '@/i18n';
import { DIALOG_MIN } from '@/lib/dialog-rect';
import { downloadText } from '@/lib/download';
import { plainFileName } from '@/lib/file-name';
import { matchesAnyTerm, rankBySearch, searchTerms } from '@/lib/search-terms';
import { entryKeyOf } from '@/lib/text-entry';

// ─────────────────────────────
// 追加辞書のダイアログ。機能のタブの「編集」と、プロンプトのタブの個別追加辞書の欄で開く。
// 嵌める列が無いので自由移動だけで出す。
// ─────────────────────────────

/** 一度に出す項目の数。多い辞書は絞り込んだ結果の先頭だけを出す（描く行の数を抑える） */
const SHOWN_LIMIT = 200;

const ICON_BUTTON = 'hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1';

/** トリガー検索範囲の欄から 0 以上の整数に直す。空や読めないものは既定 */
function scanDepthOf(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_SCAN_DEPTH;
}

function entryTexts(entry: LoreEntry): { names: string[]; texts: string[] } {
  return {
    names: [...entry.keys],
    texts: [...entry.keys, ...entry.secondaryKeys, entry.content],
  };
}

/** 追加辞書のダイアログの props */
export interface DictionaryDialogProps {
  /** 直す辞書（プリセットのロアブックは、プリセットの名前と項目の列で渡す） */
  readonly dictionary: Dictionary;
  /** 直しかけを書く（OK を押し、直しかけがあるとき） */
  readonly onSave: (patch: {
    readonly name: string;
    readonly entries: readonly LoreEntry[];
    readonly scanDepth: number;
  }) => void;
  /** 辞書を消す（プリセットのロアブックは空にする） */
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/**
 * 辞書の名前と項目を直しかけとして持ち、「OK」で書く先へ渡して閉じる。開くたびに中身を作り直す
 * （`key` に辞書の id を渡す。直しかけを別の辞書に持ち越さない）
 */
export function DictionaryDialog({
  dictionary,
  onSave,
  onRemove,
  onClose,
}: DictionaryDialogProps): React.ReactElement {
  // 直しかけ（保存するまで辞書に書かない）
  const [name, setName] = useState(dictionary.name);
  const [entries, setEntries] = useState<readonly LoreEntry[]>(dictionary.entries);
  const savedScanDepth = dictionary.scanDepth ?? DEFAULT_SCAN_DEPTH;
  const [scanDepth, setScanDepth] = useState(savedScanDepth);
  const [query, setQuery] = useState('');
  // 本文の欄を開いている項目（直しかけの中の位置。画面の中だけ）
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  // 項目を足す・消す・並べ替えると位置がずれるので、行を作り直す（打ちかけを別の項目に持ち越さない）
  const [generation, setGeneration] = useState(0);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const dirty =
    name.trim() !== dictionary.name ||
    scanDepth !== savedScanDepth ||
    !sameEntries(entries, dictionary.entries);

  // `##` で始まる名前は予約（アプリの辞書）。予約の辞書は名前を変えられず、ほかの辞書には
  // 付けられない（空と同じく元の名前に戻し、そのわけを出す）
  const reservedHintId = useId();
  const reserved = isReservedBookName(dictionary.name);
  const refused = !reserved && isReservedBookName(name);
  const usable = (value: string): boolean =>
    value.trim().length > 0 && (reserved || !isReservedBookName(value));
  const commitName = (): void => {
    if (!usable(name)) setName(dictionary.name);
  };
  /** 直しかけがあれば辞書に書いて閉じる */
  const accept = (): void => {
    if (dirty) {
      // プレイブックの辞書の段は、トリガーワードを題に合わせ直す（`*, 【段の題】`）
      const saved = dictionary.name === PLAYBOOK_BOOK ? withStepKeys(entries) : entries;
      onSave({ name: usable(name) ? name.trim() : dictionary.name, entries: saved, scanDepth });
    }
    onClose();
  };
  const requestClose = (): void => {
    if (dirty) setConfirmingClose(true);
    else onClose();
  };
  const rebuild = (next: readonly LoreEntry[], open: ReadonlySet<number>): void => {
    setEntries(next);
    setExpanded(open);
    setGeneration(generation + 1);
  };
  const addEntry = (): void => {
    setQuery('');
    rebuild([...entries, blankDictionaryEntry()], new Set([...expanded, entries.length]));
  };
  const removeEntry = (at: number): void => {
    // 開いている項目は、詰めた後の位置で開いたままにする
    const open = [...expanded].flatMap((index) =>
      index === at ? [] : [index > at ? index - 1 : index],
    );
    rebuild(
      entries.filter((_, index) => index !== at),
      new Set(open),
    );
  };
  /**
   * 並べ替える。送る順も一覧の順にするため、並び（order）を位置で振り直す
   */
  const moveEntry = (from: number, to: number): void => {
    const moved = arrayMove([...entries], from, to).map((entry, order) => ({ ...entry, order }));
    const positions = arrayMove(
      entries.map((_, index) => index),
      from,
      to,
    );
    rebuild(moved, new Set(positions.flatMap((old, at) => (expanded.has(old) ? [at] : []))));
  };
  const toggle = (index: number): void => {
    const next = new Set(expanded);
    if (!next.delete(index)) next.add(index);
    setExpanded(next);
  };

  const terms = searchTerms(query);
  const indexed = entries.map((entry, index) => ({ entry, index }));
  const matched = rankBySearch(
    indexed.filter(({ entry }) => matchesAnyTerm(entryTexts(entry).texts, terms)),
    query,
    ({ entry }) => entryTexts(entry),
  );
  // 開いている項目は先頭の件数の外でも出す（末尾に足した項目が見えなくならないように）
  const shown = matched.filter((item, at) => at < SHOWN_LIMIT || expanded.has(item.index));

  return (
    <DialogFrame
      id="chat-dictionary"
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      size="md"
      movable
      embeddable={false}
      minSize={DIALOG_MIN}
      title={dictionary.name}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-2 border-b p-3 text-xs">
          <div className="flex items-center gap-1">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-muted-foreground shrink-0">{t('llm.dictionary.name')}</span>
              <input
                className={`${FIELD_XS} min-w-0 flex-1`}
                value={name}
                readOnly={reserved}
                aria-invalid={refused}
                aria-describedby={refused ? reservedHintId : undefined}
                onChange={(event) => setName(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  const key = entryKeyOf(event);
                  if (key === 'commit') commitName();
                  if (key === 'cancel') {
                    // 欄の打ちかけだけを戻す（ダイアログは閉じない）
                    event.stopPropagation();
                    setName(dictionary.name);
                  }
                }}
              />
            </label>
            {/* 書き出すのは辞書にある中身（直しかけは入れない） */}
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('llm.dictionary.export')}
              title={t('llm.dictionary.export')}
              onClick={() =>
                downloadText(
                  worldInfoJson(dictionary),
                  plainFileName(dictionary.name, 'json', 'dictionary'),
                  'application/json',
                )
              }
            >
              <Download className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('common.delete')}
              title={t('common.delete')}
              onClick={() => setConfirmingRemove(true)}
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
          {refused ? (
            <p id={reservedHintId} role="alert" className="text-destructive">
              {t('llm.dictionary.reservedName', { prefix: RESERVED_BOOK_PREFIX })}
            </p>
          ) : null}
          {/* トリガーを探す履歴の件数。最新の入力はいつも加える（項目の見る範囲があればそちら） */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">{t('llm.dictionary.scanDepth')}</span>
            <span className="text-muted-foreground shrink-0">
              {t('llm.dictionary.scanDepthBefore')}
            </span>
            <div className="w-14 shrink-0">
              <DictionaryNumberField
                label={t('llm.dictionary.scanDepth')}
                value={scanDepth}
                min={0}
                text={String}
                parse={scanDepthOf}
                onCommit={setScanDepth}
              />
            </div>
            <span className="text-muted-foreground min-w-0">
              {t('llm.dictionary.scanDepthHint')}
            </span>
          </div>
        </div>
        <DialogToolbar label={t('llm.dictionary.filterToolbar')}>
          <SearchField
            className="w-full max-w-xs min-w-0"
            value={query}
            onChange={setQuery}
            label={t('llm.dictionary.filterLabel')}
            placeholder={t('llm.dictionary.filterPlaceholder')}
          />
        </DialogToolbar>
        <DictionaryEntryList
          shown={shown}
          generation={generation}
          expanded={expanded}
          // 絞り込んでいる間は並べ替えない（見えていない項目との前後が決まらない）
          sortable={terms.length === 0}
          onToggle={toggle}
          onChange={(index, next) =>
            setEntries(entries.map((item, at) => (at === index ? next : item)))
          }
          onRemove={removeEntry}
          onMove={moveEntry}
          footer={
            <>
              {shown.length === 0 ? (
                <li className={EMPTY_NOTICE_CLASS}>{t('llm.dictionary.noMatch')}</li>
              ) : matched.length > shown.length ? (
                <li className="text-muted-foreground px-2 py-1">
                  {t('llm.dictionary.more', { count: matched.length - shown.length })}
                </li>
              ) : null}
              {/* 一覧の末尾に置き、空の項目を末尾に足す */}
              <li className={`${ENTRY_GRID} px-1 py-0.5`}>
                <button
                  type="button"
                  className={`${ENTRY_LEAD} text-muted-foreground hover:text-foreground
                    inline-flex items-center gap-0.5 justify-self-start rounded-sm`}
                  onClick={addEntry}
                >
                  <CirclePlus className="size-3.5" aria-hidden />
                  {t('llm.dictionary.addEntry')}
                </button>
              </li>
            </>
          }
        />
        {/* 下の帯。Cancel は直しかけを捨てて閉じ、OK は書いて閉じる */}
        <div className="flex shrink-0 justify-end gap-2 border-t p-2">
          <button type="button" className={dialogButton({ tone: 'secondary' })} onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className={dialogButton({ tone: 'primary' })} onClick={accept}>
            {t('common.ok')}
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
      <ConfirmDialog
        open={confirmingRemove}
        title={t('llm.dictionary.deleteTitle')}
        description={t('llm.dictionary.deleteMessage', { name: dictionary.name })}
        confirmLabel={t('common.deleteConfirm')}
        onConfirm={() => {
          setConfirmingRemove(false);
          onRemove();
          onClose();
        }}
        onCancel={() => setConfirmingRemove(false)}
      />
    </DialogFrame>
  );
}
