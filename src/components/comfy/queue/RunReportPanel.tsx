import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';

import { NodePackFinder } from '@/components/comfy/queue/NodePackFinder';
import { CopyButton } from '@/components/ui/copy-button';
import type { WorkflowModel } from '@/graph/missing-models';
import type { NodeId } from '@/graph/types';
import { useRunReport } from '@/hooks/run/use-run-report';
import { t } from '@/i18n';
import {
  reportLineKey,
  type ReportLine,
  type ReportTone,
  type RunReport,
} from '@/queue/run-report';
import { useRunReportStore } from '@/store/use-run-report-store';

const lineText = cva('whitespace-pre-wrap break-words', {
  variants: {
    tone: {
      error: 'text-destructive',
      warning: 'text-slot-conditioning',
      muted: 'text-muted-foreground',
    } satisfies Record<ReportTone, string>,
  },
});

interface ReportCardItem {
  readonly key: string;
  readonly heading: {
    readonly index: string | null;
    readonly name: string;
    readonly cardId: NodeId | null;
  } | null;
  readonly line: ReportLine;
}

function ReportCard({ item }: { readonly item: ReportCardItem }): React.ReactElement {
  const dismiss = useRunReportStore((state) => state.dismiss);
  const requestReveal = useRunReportStore((state) => state.requestReveal);
  const { heading, line } = item;
  const cardId = heading?.cardId ?? null;
  return (
    <li className="group/card bg-card relative flex flex-col gap-1 rounded-md border p-2">
      {heading === null ? null : (
        <h3 className="flex min-w-0 items-baseline gap-1 font-semibold">
          {heading.index === null ? null : (
            <span className="bg-muted shrink-0 rounded px-1 tabular-nums">{heading.index}</span>
          )}
          {cardId === null ? (
            <span className="min-w-0 truncate" title={heading.name}>
              {heading.name}
            </span>
          ) : (
            <button
              type="button"
              className="min-w-0 truncate text-left hover:underline"
              title={t('run.report.revealTitle')}
              aria-label={t('run.report.reveal', { name: heading.name })}
              onClick={() => requestReveal(cardId)}
            >
              {heading.name}
            </button>
          )}
        </h3>
      )}
      <div className={lineText({ tone: line.tone })}>
        {line.text}
        {line.model === undefined ? null : <ModelSource model={line.model} />}
        {line.steps === undefined ? null : (
          <ol className="text-muted-foreground mt-0.5 list-decimal pl-4">
            {line.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </div>
      <button
        type="button"
        className="bg-card hover:bg-muted absolute top-1 right-1 inline-flex items-center
          rounded-md border p-1 opacity-0 transition-opacity group-hover/card:opacity-100
          focus-visible:opacity-100"
        aria-label={t('run.report.dismiss')}
        title={t('run.report.dismiss')}
        onClick={() => dismiss(item.key)}
      >
        <X className="size-3" aria-hidden />
      </button>
    </li>
  );
}

function ModelSource({ model }: { readonly model: WorkflowModel }): React.ReactElement {
  const place = `models/${model.directory}/`;
  return (
    <div className="text-muted-foreground mt-0.5 flex flex-col gap-0.5">
      {model.url === null ? null : (
        <span className="flex min-w-0 items-center gap-1">
          {model.linkable ? (
            <a
              href={model.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline"
              title={model.url}
            >
              {t('run.report.model.openSource')}
            </a>
          ) : (
            <span className="break-all">{t('run.report.model.source', { url: model.url })}</span>
          )}
          <CopyButton text={model.url} label={t('run.report.model.copyUrl')} iconOnly frameless />
        </span>
      )}
      <span className="flex items-center gap-1">
        {t('run.report.model.place', { directory: model.directory })}
        <CopyButton text={place} label={t('run.report.model.copyPlace')} iconOnly frameless />
      </span>
    </div>
  );
}

export function RunReportPanel(): React.ReactElement {
  const report = useRunReport();

  if (report.total === 0) {
    return <p className="text-muted-foreground px-1 text-2xs">{t('run.report.noIssues')}</p>;
  }

  return (
    <div className="flex flex-col gap-2 px-1 text-2xs">
      <NodePackFinder />
      <ul className="flex flex-col gap-2">
        {cardItemsOf(report).map((item, at) => (
          <ReportCard key={`${String(at)}:${item.key}`} item={item} />
        ))}
      </ul>
    </div>
  );
}

function cardItemsOf(report: RunReport): ReportCardItem[] {
  return [
    ...report.general.map((line) => ({ key: reportLineKey(null, line), heading: null, line })),
    ...report.nodes.flatMap((node) =>
      node.lines.map((line) => ({
        key: reportLineKey(node.key, line),
        heading: { index: node.index, name: node.name, cardId: node.cardId },
        line,
      })),
    ),
  ];
}
