import { SidePanelContent, SidePanelRailIcon } from '@/components/comfy/side-panel-parts';
import { PANELS } from '@/components/comfy/side-panel-tabs';
import { useEmbedAnchor } from '@/components/ui/embed-anchors';
import { SideColumn } from '@/components/ui/side-column';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { useReportWatch } from '@/hooks/run/use-report-watch';
import { useRunReport } from '@/hooks/run/use-run-report';
import { t } from '@/i18n';
import { reportAlert } from '@/queue/run-report';
import { useSidePanelStore, type SidePanelTab } from '@/store/use-side-panel-store';

function isPanel(value: string): value is SidePanelTab {
  return PANELS.some((panel) => panel.value === value);
}

export function SidePanel(): React.ReactElement {
  const tab = useSidePanelStore((state) => state.tab);
  const setTab = useSidePanelStore((state) => state.setTab);
  const report = useRunReport();
  const clearReportWatch = useSidePanelStore((state) => state.clearReportWatch);
  useReportWatch(report);
  const attachPanel = useEmbedAnchor('side');

  const kit: SideColumnKit = {
    label: t('comfy.side.label'),
    attachPanel,
    sections: PANELS.map((panel) => ({
      value: panel.value,
      label: t(panel.label),
      alert: panel.value === 'report' ? reportAlert(report) : 'none',
    })),
    selected: tab,
    onSelect: (value) => {
      if (!isPanel(value)) return;
      clearReportWatch();
      setTab(value);
    },
    renderTabExtra: (value) =>
      value === 'report' && report.total > 0 ? (
        <span className="tabular-nums">{report.total}</span>
      ) : null,
    renderRailIcon: (value) =>
      isPanel(value) ? <SidePanelRailIcon tab={value} reportTotal={report.total} /> : null,
    renderContent: (value, wrap) =>
      isPanel(value) ? <SidePanelContent tab={value} wrap={wrap} /> : null,
  };

  return <SideColumn kit={kit} />;
}
