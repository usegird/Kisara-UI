import { cva } from 'class-variance-authority';
import { CircleAlert, History, ListTodo, Settings } from 'lucide-react';
import { memo } from 'react';

import { HistoryPanel } from '@/components/comfy/queue/HistoryPanel';
import { QueuePanel } from '@/components/comfy/queue/QueuePanel';
import { RunReportPanel } from '@/components/comfy/queue/RunReportPanel';
import { SettingsPanel } from '@/components/comfy/SettingsPanel';
import { PANELS } from '@/components/comfy/side-panel-tabs';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { t } from '@/i18n';
import type { SidePanelTab } from '@/store/use-side-panel-store';

const settingsWidth = cva('', { variants: { wide: { true: '[--control-max:560px]', false: '' } } });

export function SidePanelRailIcon({
  tab,
  reportTotal,
}: {
  readonly tab: SidePanelTab;
  readonly reportTotal: number;
}): React.ReactElement {
  if (tab === 'queue') return <ListTodo className="size-4" aria-hidden />;
  if (tab === 'history') return <History className="size-4" aria-hidden />;
  if (tab === 'settings') return <Settings className="size-4" aria-hidden />;
  return (
    <>
      <CircleAlert className="size-4" aria-hidden />
      {reportTotal > 0 ? (
        <span className="absolute -right-0.5 -bottom-0.5 text-[9px] leading-none tabular-nums">
          {reportTotal}
        </span>
      ) : null}
    </>
  );
}

export interface SidePanelContentProps {
  readonly tab: SidePanelTab;
  readonly wrap: boolean;
}

export const SidePanelContent = memo(function SidePanelContent({
  tab,
  wrap,
}: SidePanelContentProps): React.ReactElement {
  const label = PANELS.find((panel) => panel.value === tab)?.label ?? 'comfy.side.queue';
  return (
    <ErrorBoundary label={t('comfy.side.tabBoundary', { name: t(label) })}>
      {tab === 'queue' ? (
        <QueuePanel wrap={wrap} />
      ) : tab === 'history' ? (
        <HistoryPanel wrap={wrap} />
      ) : tab === 'report' ? (
        <RunReportPanel />
      ) : (
        <div className={settingsWidth({ wide: wrap })}>
          <SettingsPanel />
        </div>
      )}
    </ErrorBoundary>
  );
});
