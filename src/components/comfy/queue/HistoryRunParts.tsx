import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { useState } from 'react';

import { Section } from '@/components/comfy/queue/task-detail-sections';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { EMPTY_MARK, formatDateTimeSeconds } from '@/i18n/format';
import { entryKeyOf } from '@/lib/text-entry';
import { cn } from '@/lib/utils';
import type { OutputFileRef } from '@/port/files';
import { imagesOf } from '@/queue/outputs';
import { promptNumbers, type HistoryCard, type RunSeed } from '@/queue/run-history-view';

const RUN_KEY_STEP: Readonly<Partial<Record<string, number>>> = { ArrowUp: -1, ArrowDown: 1 };

const SUMMARY_LABEL = 'text-muted-foreground text-2xs font-semibold';

function SessionNameField({
  session,
  name,
  onRename,
}: {
  readonly session: string;
  readonly name: string;
  readonly onRename: (name: string) => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        className="border-input bg-background h-6 min-w-0 flex-1 rounded-md border px-2 text-xs
          focus-visible:outline-2"
        aria-label={t('history.detail.renameInput')}
        defaultValue={name}
        onBlur={(event) => {
          setEditing(false);
          onRename(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          const key = entryKeyOf(event);
          if (key === null) return;
          event.stopPropagation();
          if (key === 'cancel') event.currentTarget.value = name;
          event.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <>
      <span className="min-w-0 truncate" title={session}>
        {session}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 rounded-md
          p-0.5 focus-visible:outline-2"
        aria-label={t('history.detail.rename')}
        title={t('history.detail.rename')}
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3" aria-hidden />
      </button>
    </>
  );
}

function outputPath(file: OutputFileRef): string {
  return file.subfolder.length > 0 ? `${file.subfolder}/${file.filename}` : file.filename;
}

export function RunSummary({
  session,
  name,
  onRename,
  files,
}: {
  readonly session: string;
  readonly name: string;
  readonly onRename: (name: string) => void;
  readonly files: readonly OutputFileRef[];
}): React.ReactElement {
  return (
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
      <dt className={SUMMARY_LABEL}>{t('history.detail.sessionLabel')}</dt>
      <dd className="flex min-w-0 items-center gap-1">
        <SessionNameField session={session} name={name} onRename={onRename} />
      </dd>
      <dt className={SUMMARY_LABEL}>{t('history.detail.typeLabel')}</dt>
      <dd className="flex min-w-0 flex-col">
        {files.length === 0 ? (
          <span className="text-muted-foreground">{EMPTY_MARK}</span>
        ) : (
          files.map((file) => (
            <span
              key={`${file.type}:${outputPath(file)}`}
              className="truncate"
              title={outputPath(file)}
            >
              <span className="text-muted-foreground mr-2">{file.type}</span>
              {outputPath(file)}
            </span>
          ))
        )}
      </dd>
    </dl>
  );
}

export function MoveButtons({
  hasNewer,
  hasOlder,
  onMove,
}: {
  readonly hasNewer: boolean;
  readonly hasOlder: boolean;
  readonly onMove: (direction: number) => void;
}): React.ReactElement {
  return (
    <>
      <button
        type="button"
        className={cn(DIALOG_ICON_CLASS, 'p-1')}
        aria-label={t('history.detail.newer')}
        disabled={!hasNewer}
        onClick={() => onMove(-1)}
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className={cn(DIALOG_ICON_CLASS, 'p-1')}
        aria-label={t('history.detail.older')}
        disabled={!hasOlder}
        onClick={() => onMove(1)}
      >
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </>
  );
}

const SEED_PART = 'min-w-0 truncate';

export function SeedsSection({
  seeds,
}: {
  readonly seeds: readonly RunSeed[];
}): React.ReactElement {
  return (
    <Section title={t('history.detail.seedSection')}>
      {seeds.length === 0 ? (
        <p className="text-muted-foreground">{EMPTY_MARK}</p>
      ) : (
        <ul className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)] gap-x-1.5 gap-y-0.5">
          {seeds.map((seed) => (
            <li
              key={`${seed.nodeId}.${seed.input}`}
              className="col-span-4 grid grid-cols-subgrid items-baseline whitespace-nowrap"
            >
              <span className="text-muted-foreground tabular-nums">
                {t('history.detail.seedNode', { id: seed.nodeId })}
              </span>
              <span className="text-muted-foreground">{seed.input}</span>
              <span className="tabular-nums">{String(seed.value)}</span>
              <span className="flex min-w-0 items-baseline gap-1.5">
                {seed.name === null ? null : (
                  <span className={SEED_PART} title={seed.name}>
                    {seed.name}
                  </span>
                )}
                {seed.comment === null ? null : (
                  <span className={cn(SEED_PART, 'text-muted-foreground')} title={seed.comment}>
                    {seed.comment}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RunList({
  card,
  selected,
  onSelect,
  list,
}: {
  readonly card: HistoryCard;
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly list: React.RefObject<HTMLUListElement | null>;
}): React.ReactElement {
  const numbers = promptNumbers(card);
  const moveSelection = (event: React.KeyboardEvent, index: number): void => {
    const step = RUN_KEY_STEP[event.key] ?? 0;
    if (step === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = Math.min(Math.max(index + step, 0), card.runs.length - 1);
    if (next === index) return;
    onSelect(next);
    list.current?.querySelectorAll('button')[next]?.focus();
  };
  return (
    <Section title={t('history.detail.runs')}>
      <ul ref={list} className="flex flex-col">
        {card.runs.map((run, index) => (
          <li key={run.startedAt}>
            <button
              type="button"
              aria-pressed={index === selected}
              onKeyDown={(event) => moveSelection(event, index)}
              className="hover:bg-muted aria-pressed:bg-accent flex w-full items-baseline gap-3
                rounded px-1.5 py-1 text-left tabular-nums"
              onClick={() => onSelect(index)}
            >
              <span className="shrink-0">{formatDateTimeSeconds(run.startedAt)}</span>
              <span className="bg-muted shrink-0 rounded px-1 font-semibold">
                P{numbers.get(run.prompt) ?? '-'}
              </span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate">
                {run.seeds.length === 0
                  ? null
                  : t('history.detail.seeds', { seeds: run.seeds.map(String).join(', ') })}
              </span>
              <span className="text-muted-foreground shrink-0">
                {t('history.detail.images', { count: String(imagesOf(run.outputs).length) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
