import { cva } from 'class-variance-authority';
import { Lock, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { DictionaryDraft } from '@/components/comfy/dialogs/tag-panel-draft';
import { arrowSelect } from '@/components/ui/arrow-select';
import { field } from '@/components/ui/field';
import { isDefaultDictionary } from '@/graph/tag-dictionary';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';

const ITEM_ICON = `text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded p-1
  opacity-0 group-hover/item:opacity-100 focus:opacity-100 disabled:opacity-0`;
const ADD_BUTTON = `text-muted-foreground hover:text-foreground hover:bg-muted flex w-full
  items-center gap-1 rounded px-2 py-1 text-left text-xs disabled:opacity-50`;

const dictionaryItem = cva(
  'hover:bg-accent flex min-w-0 flex-1 items-baseline gap-2 rounded px-2 py-1 text-left text-xs',
  { variants: { selected: { true: 'bg-accent', false: '' } } },
);

const itemName = cva('flex min-w-0 flex-1 items-center gap-1 truncate', {
  variants: { removed: { true: 'text-muted-foreground line-through', false: '' } },
});

export type TagView =
  | { readonly kind: 'all' }
  | { readonly kind: 'dictionary'; readonly name: string }
  | { readonly kind: 'pysssss' };

interface DictionaryListProps {
  readonly view: TagView;
  readonly totals: { readonly all: number; readonly pysssss: number | null };
  readonly dictionaries: readonly DictionaryDraft[];
  readonly canWrite: boolean;
  readonly onSelect: (view: TagView) => void;
  readonly onToggle: (name: string) => void;
  readonly onAdd: (name: string) => string | null;
}

export function DictionaryList({
  view,
  totals,
  dictionaries,
  canWrite,
  onSelect,
  onToggle,
  onAdd,
}: DictionaryListProps): React.ReactElement {
  const item = (target: TagView, label: React.ReactNode, count: number) => (
    <button
      type="button"
      className={dictionaryItem({ selected: sameView(view, target) })}
      aria-pressed={sameView(view, target)}
      onClick={() => onSelect(target)}
    >
      {label}
      <span className="text-muted-foreground shrink-0 tabular-nums">{count}</span>
    </button>
  );
  return (
    <ul
      aria-label={t('tags.dictionaries')}
      className="min-h-0 flex-1 overflow-y-auto p-1"
      onKeyDown={(event) => arrowSelect(event, 'list')}
    >
      <li className="flex">
        {item({ kind: 'all' }, <span className={itemName()}>{t('tags.all')}</span>, totals.all)}
      </li>
      {dictionaries.map((dictionary) => (
        <li key={`d:${dictionary.name}`} className="group/item flex items-center gap-0.5">
          {item(
            { kind: 'dictionary', name: dictionary.name },
            <span className={itemName({ removed: dictionary.removed })}>
              {dictionary.changed ? `${dictionary.name} *` : dictionary.name}
            </span>,
            dictionary.rows.filter((row) => !row.removed).length,
          )}
          <DictionaryToggle dictionary={dictionary} canWrite={canWrite} onToggle={onToggle} />
        </li>
      ))}
      {totals.pysssss === null ? null : (
        <li className="flex">
          {item(
            { kind: 'pysssss' },
            <span className={itemName()}>
              {t('tags.pysssss')}
              <Lock className="size-3 shrink-0" aria-label={t('tags.readOnly')} />
            </span>,
            totals.pysssss,
          )}
        </li>
      )}
      <li>
        <AddDictionary canWrite={canWrite} onAdd={onAdd} />
      </li>
    </ul>
  );
}

function DictionaryToggle({
  dictionary,
  canWrite,
  onToggle,
}: {
  readonly dictionary: DictionaryDraft;
  readonly canWrite: boolean;
  readonly onToggle: (name: string) => void;
}): React.ReactElement | null {
  if (!dictionary.exists && isDefaultDictionary(dictionary.name)) return null;
  const { removed, name } = dictionary;
  const Icon = removed ? RotateCcw : Trash2;
  return (
    <button
      type="button"
      className={ITEM_ICON}
      disabled={!canWrite}
      aria-label={t(removed ? 'tags.restoreDictionary' : 'tags.removeDictionary', { name })}
      title={t(removed ? 'tags.restoreDictionaryTitle' : 'tags.removeDictionaryTitle')}
      onClick={() => onToggle(name)}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

function AddDictionary({
  canWrite,
  onAdd,
}: {
  readonly canWrite: boolean;
  readonly onAdd: (name: string) => string | null;
}): React.ReactElement {
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = (): void => {
    setName(null);
    setError(null);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (isComposingKey(event)) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
      stop();
      return;
    }
    if (event.key !== 'Enter' || name === null) return;
    event.preventDefault();
    const failure = onAdd(name);
    if (failure === null) stop();
    else setError(failure);
  };

  if (name === null) {
    return (
      <button
        type="button"
        className={ADD_BUTTON}
        disabled={!canWrite}
        title={t('tags.addDictionaryTitle')}
        onClick={() => setName('')}
      >
        <Plus className="size-3.5" aria-hidden />
        {t('tags.addDictionary')}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1 px-1 py-1">
      <input
        className={field({ size: 'xs', width: 'full' })}
        aria-label={t('tags.dictionaryName')}
        placeholder={t('tags.dictionaryName')}
        autoFocus
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (name.trim().length === 0) stop();
        }}
      />
      {error === null ? null : <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

function sameView(a: TagView, b: TagView): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'dictionary' || (b.kind === 'dictionary' && a.name === b.name);
}
