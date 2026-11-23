import { cva } from 'class-variance-authority';
import { Loader2, X } from 'lucide-react';
import { useRef } from 'react';

import { arrowSelect } from '@/components/ui/arrow-select';
import { CopyButton } from '@/components/ui/copy-button';
import { InsertIconButton } from '@/components/ui/insert-icon-button';
import { textDragProps } from '@/components/ui/text-drag';
import { wildcardDirectory, wildcardLabel } from '@/graph/wildcards';
import { t } from '@/i18n';
import type { WildcardEntries } from '@/store/use-wildcards-store';

const wildcardItem = cva(
  ['hover:bg-accent flex w-full items-baseline gap-2 rounded px-2 py-1', 'text-left'],
  { variants: { selected: { true: 'bg-accent', false: '' } } },
);

export interface WildcardListProps {
  readonly shown: readonly string[];
  readonly directory: string;
  readonly selected: string | null;
  readonly onSelect: (name: string) => void;
  readonly onPlace: (name: string, origin: DOMRect) => void;
}

export function WildcardList({
  shown,
  directory,
  selected,
  onSelect,
  onPlace,
}: WildcardListProps): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-1">
      {shown.length === 0 ? (
        <p className="text-muted-foreground p-2">{t('wildcards.noMatch')}</p>
      ) : (
        <ul aria-label={t('wildcards.list')} onKeyDown={(event) => arrowSelect(event, 'list')}>
          {shown.map((name) => {
            const onRowDoubleClick = (event: React.MouseEvent<HTMLButtonElement>): void =>
              onPlace(name, event.currentTarget.getBoundingClientRect());
            return (
              <li key={name} {...textDragProps(name)}>
                <button
                  type="button"
                  className={wildcardItem({ selected: name === selected })}
                  title={t('wildcards.itemTitle', { name })}
                  aria-label={name}
                  aria-pressed={name === selected}
                  onClick={() => onSelect(name)}
                  onDoubleClick={onRowDoubleClick}
                >
                  <span className="truncate">{wildcardLabel(name)}</span>
                  {directory === '' && wildcardDirectory(name) !== '' ? (
                    <span className="text-muted-foreground truncate">
                      {wildcardDirectory(name)}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export interface WildcardPreviewProps {
  readonly name: string;
  readonly entries: WildcardEntries | null;
  readonly insertBlocked: string | null;
  readonly onInsert: (origin: DOMRect | null) => void;
  readonly onBack: () => void;
}

export function WildcardPreview({
  name,
  entries,
  insertBlocked,
  onInsert,
  onBack,
}: WildcardPreviewProps): React.ReactElement {
  const nameBox = useRef<HTMLElement>(null);
  const onInsertClick = (): void => onInsert(nameBox.current?.getBoundingClientRect() ?? null);
  return (
    <>
      <div className="flex min-h-7 items-center gap-2 border-b px-3 py-2">
        <InsertIconButton
          label={t('wildcards.insert')}
          blocked={insertBlocked}
          onInsert={onInsertClick}
        />
        <code ref={nameBox} className="bg-muted min-w-0 truncate rounded px-1.5 py-0.5 font-mono">
          {name}
        </code>
        <CopyButton iconOnly frameless text={name} label={t('wildcards.copy')} />
        <button
          type="button"
          className="text-muted-foreground hover:bg-muted -mr-1 ml-auto shrink-0 rounded p-1"
          aria-label={t('wildcards.back')}
          title={t('wildcards.back')}
          onClick={onBack}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <section
        aria-label={t('wildcards.preview.title')}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
      >
        <p className="text-muted-foreground">{t('wildcards.preview.note')}</p>
        <EntriesBody entries={entries} />
      </section>
    </>
  );
}

function EntriesBody({
  entries,
}: {
  readonly entries: WildcardEntries | null;
}): React.ReactElement {
  if (entries === null || entries.status === 'loading') {
    return (
      <p className="text-muted-foreground flex items-center gap-2" role="status">
        <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
        {t('wildcards.preview.loading')}
      </p>
    );
  }
  if (entries.status === 'unavailable') {
    return <p className="text-muted-foreground">{t('wildcards.preview.unavailable')}</p>;
  }
  if (entries.status === 'error') {
    return (
      <p className="text-destructive" role="alert">
        {t('wildcards.preview.failed', { error: entries.error })}
      </p>
    );
  }
  if (entries.values.length === 0) {
    return <p className="text-muted-foreground">{t('wildcards.preview.empty')}</p>;
  }
  return (
    <ul aria-label={t('wildcards.preview.entries')} className="space-y-0.5">
      {keyedEntries(entries.values).map((entry) => (
        <li
          key={entry.key}
          className="bg-muted/50 rounded px-2 py-1 break-words whitespace-pre-wrap"
        >
          {entry.value}
        </li>
      ))}
    </ul>
  );
}

function keyedEntries(
  values: readonly string[],
): ReadonlyArray<{ readonly key: string; readonly value: string }> {
  const seen = new Map<string, number>();
  return values.map((value) => {
    const count = (seen.get(value) ?? 0) + 1;
    seen.set(value, count);
    return { key: `${value}\u0000${String(count)}`, value };
  });
}
