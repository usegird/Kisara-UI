import { Info } from 'lucide-react';

import type { ResponseFigure } from '@/components/llm/message/response-figures';
import { t } from '@/i18n';

export function ResponseStatsButton({
  open,
  className,
  onToggle,
}: {
  readonly open: boolean;
  readonly className: string;
  readonly onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={className}
      aria-label={t('llm.stats.toggle')}
      aria-expanded={open}
      title={t('llm.stats.toggle')}
      onClick={onToggle}
    >
      <Info className="size-3.5" aria-hidden />
    </button>
  );
}

export function ResponseStatsPanel({
  figures,
}: {
  readonly figures: readonly (readonly ResponseFigure[])[];
}): React.ReactElement {
  return (
    <div
      role="group"
      aria-label={t('llm.stats.title')}
      className="text-muted-foreground flex flex-col gap-y-0.5 px-1 text-xs"
    >
      {figures.map((line) => (
        <dl key={line[0]?.key} className="flex flex-wrap gap-x-4 gap-y-0.5">
          {line.map((figure) => (
            <div key={figure.key} className="flex items-baseline gap-1.5">
              <dt>{figure.label}</dt>
              <dd className="text-foreground tabular-nums">{figure.value}</dd>
            </div>
          ))}
        </dl>
      ))}
    </div>
  );
}
