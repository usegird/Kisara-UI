import { cva } from 'class-variance-authority';

import { NodePackFinder } from '@/components/comfy/queue/NodePackFinder';
import { CopyButton } from '@/components/ui/copy-button';
import type { WorkflowModel } from '@/graph/missing-models';
import { useRunReport } from '@/hooks/run/use-run-report';
import { t } from '@/i18n';
import type { ReportLine, ReportTone } from '@/queue/run-report';

const lineText = cva('whitespace-pre-wrap break-words', {
  variants: {
    tone: {
      error: 'text-destructive',
      warning: 'text-slot-conditioning',
      muted: 'text-muted-foreground',
    } satisfies Record<ReportTone, string>,
  },
});

function Lines({ lines }: { readonly lines: readonly ReportLine[] }): React.ReactElement {
  return (
    <ul className="flex flex-col gap-1">
      {lines.map((line, at) => (
        <li key={`${String(at)}:${line.text}`} className={lineText({ tone: line.tone })}>
          {line.text}
          {line.model === undefined ? null : <ModelSource model={line.model} />}
          {line.steps === undefined ? null : (
            <ol className="text-muted-foreground mt-0.5 list-decimal pl-4">
              {line.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ul>
  );
}

function ModelSource({ model }: { readonly model: WorkflowModel }): React.ReactElement {
  const place = `models/${model.directory}/`;
  return (
    <div className="text-muted-foreground mt-0.5 flex flex-col gap-0.5">
      <span className="flex items-center gap-1">
        {t('run.report.model.place', { directory: model.directory })}
        <CopyButton text={place} label={t('run.report.model.copyPlace')} iconOnly frameless />
      </span>
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
    </div>
  );
}

export function RunReportPanel(): React.ReactElement {
  const report = useRunReport();

  if (report.total === 0) {
    return <p className="text-muted-foreground px-1 text-2xs">{t('run.report.noIssues')}</p>;
  }

  return (
    <div className="flex flex-col gap-3 px-1 text-2xs">
      <NodePackFinder />
      {report.general.length === 0 ? null : <Lines lines={report.general} />}

      {report.nodes.map((node) => (
        <section key={node.key} className="flex flex-col gap-1">
          <h3 className="flex min-w-0 items-baseline gap-1 font-semibold">
            {node.index === null ? null : (
              <span className="bg-muted shrink-0 rounded px-1 tabular-nums">{node.index}</span>
            )}
            <span className="min-w-0 truncate" title={node.name}>
              {node.name}
            </span>
          </h3>
          <Lines lines={node.lines} />
        </section>
      ))}
    </div>
  );
}
