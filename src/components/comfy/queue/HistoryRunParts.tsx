import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Section } from '@/components/comfy/queue/task-detail-sections';
import { DIALOG_ICON_CLASS } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { EMPTY_MARK, formatDateTimeSeconds } from '@/i18n/format';
import { cn } from '@/lib/utils';
import type { OutputFileRef } from '@/port/files';
import { imagesOf } from '@/queue/outputs';
import { promptNumbers, type HistoryCard, type RunSeed } from '@/queue/run-history-view';

// ─────────────────────────────
// 履歴の詳細の部品（実行の要約・移動のボタン・シード・実行の一覧）
// ─────────────────────────────

/** 実行の一覧で、↑ ↓ 1 回に動かす向き */
const RUN_KEY_STEP: Readonly<Partial<Record<string, number>>> = { ArrowUp: -1, ArrowDown: 1 };

/** 見出しの欄の名前。段の見出し（`Section`）と同じ見た目 */
const SUMMARY_LABEL = 'text-muted-foreground text-2xs font-semibold';

/** 出力の置き場の中の道筋 */
function outputPath(file: OutputFileRef): string {
  return file.subfolder.length > 0 ? `${file.subfolder}/${file.filename}` : file.filename;
}

/**
 * 先頭の欄。名前と値を左右の列に並べる。セッションは 1 行、タイプは出力ごとに 1 行
 * （置き場の種別 temp / output とファイル名）
 */
export function RunSummary({
  session,
  files,
}: {
  readonly session: string;
  readonly files: readonly OutputFileRef[];
}): React.ReactElement {
  return (
    <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
      <dt className={SUMMARY_LABEL}>{t('history.detail.sessionLabel')}</dt>
      <dd className="truncate" title={session}>
        {session}
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

/** 履歴の詳細の新しい方・古い方へ移るボタン */
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

/** 短縮する欄（幅が足りなければ末尾を省く。折り返さない） */
const SEED_PART = 'min-w-0 truncate';

/**
 * シードの欄。1 行にシード 1 つ
 */
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
        // ノード番号・入力名・値は列にして行をまたいで揃える。ノード名から後は最後の列に詰める
        <ul className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)] gap-x-1.5 gap-y-0.5">
          {seeds.map((seed) => (
            <li
              key={`${seed.nodeId}.${seed.input}`}
              className="col-span-4 grid grid-cols-subgrid items-baseline whitespace-nowrap"
            >
              <span className="text-muted-foreground tabular-nums">
                {t('history.detail.seedNode', { id: seed.nodeId })}
              </span>
              {/* 揃える列は省かない（省くと最後の列に幅を取られて潰れる） */}
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

/** 実行ごとの一覧（新しい順）。押すとその実行を選ぶ */
export function RunList({
  card,
  selected,
  onSelect,
  list,
}: {
  readonly card: HistoryCard;
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  /** 並びの要素（開いたときのフォーカスと ↑ ↓ の移動に使う） */
  readonly list: React.RefObject<HTMLUListElement | null>;
}): React.ReactElement {
  const numbers = promptNumbers(card);
  /** ↑ ↓ で隣の実行を選び、その行へ移る（端では止まる） */
  const moveSelection = (event: React.KeyboardEvent, index: number): void => {
    const step = RUN_KEY_STEP[event.key] ?? 0;
    if (step === 0) return;
    event.preventDefault();
    // 詳細全体の ← → などに渡さない
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
