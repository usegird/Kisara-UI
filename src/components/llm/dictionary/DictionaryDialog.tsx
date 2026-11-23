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

const SHOWN_LIMIT = 200;

const ICON_BUTTON = 'hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1';

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

export interface DictionaryDialogProps {
  readonly dictionary: Dictionary;
  readonly onSave: (patch: {
    readonly name: string;
    readonly entries: readonly LoreEntry[];
    readonly scanDepth: number;
  }) => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

export function DictionaryDialog({
  dictionary,
  onSave,
  onRemove,
  onClose,
}: DictionaryDialogProps): React.ReactElement {
  const [name, setName] = useState(dictionary.name);
  const [entries, setEntries] = useState<readonly LoreEntry[]>(dictionary.entries);
  const savedScanDepth = dictionary.scanDepth ?? DEFAULT_SCAN_DEPTH;
  const [scanDepth, setScanDepth] = useState(savedScanDepth);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  const [generation, setGeneration] = useState(0);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const dirty =
    name.trim() !== dictionary.name ||
    scanDepth !== savedScanDepth ||
    !sameEntries(entries, dictionary.entries);

  const reservedHintId = useId();
  const reserved = isReservedBookName(dictionary.name);
  const refused = !reserved && isReservedBookName(name);
  const usable = (value: string): boolean =>
    value.trim().length > 0 && (reserved || !isReservedBookName(value));
  const commitName = (): void => {
    if (!usable(name)) setName(dictionary.name);
  };
  const accept = (): void => {
    if (dirty) {
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
    const open = [...expanded].flatMap((index) =>
      index === at ? [] : [index > at ? index - 1 : index],
    );
    rebuild(
      entries.filter((_, index) => index !== at),
      new Set(open),
    );
  };
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
                    event.stopPropagation();
                    setName(dictionary.name);
                  }
                }}
              />
            </label>
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
