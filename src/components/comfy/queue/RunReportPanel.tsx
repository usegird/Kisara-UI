import { cva } from 'class-variance-authority';

import { useRunReport } from '@/hooks/run/use-run-report';
import { t } from '@/i18n';
import type { ReportLine, ReportTone } from '@/queue/run-report';

// ─────────────────────────────
// 右の列のエラーのタブ。最後の実行の失敗と注意をノードごとに並べる（まとめる計算は `run-report.ts`）。
// ─────────────────────────────

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
        // 同じ文言が並ぶことがあるので位置を添える（並べ替えはしない一覧）
        <li key={`${String(at)}:${line.text}`} className={lineText({ tone: line.tone })}>
          {line.text}
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

/** 最後の実行の失敗と注意の一覧。無ければその旨だけを出す */
export function RunReportPanel(): React.ReactElement {
  const report = useRunReport();

  if (report.total === 0) {
    return <p className="text-muted-foreground px-1 text-2xs">{t('run.report.noIssues')}</p>;
  }

  return (
    <div className="flex flex-col gap-3 px-1 text-2xs">
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
