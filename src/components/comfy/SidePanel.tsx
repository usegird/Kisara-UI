import { SidePanelContent, SidePanelRailIcon } from '@/components/comfy/side-panel-parts';
import { PANELS } from '@/components/comfy/side-panel-tabs';
import { useEmbedAnchor } from '@/components/ui/embed-anchors';
import { SideColumn } from '@/components/ui/side-column';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { useRunReport } from '@/hooks/run/use-run-report';
import { t } from '@/i18n';
import { reportAlert } from '@/queue/run-report';
import { useSidePanelStore, type SidePanelTab } from '@/store/use-side-panel-store';

// ─────────────────────────────
// ComfyUI のタブの右の列。枠は共通の部品（`ui/side-column`）で、ここはタブと中身を渡す。
// キューの見張りと繰り返しの送りは、会話のタブを見ている間も続けるので `ComfyBackground` が持つ。
// ─────────────────────────────

function isPanel(value: string): value is SidePanelTab {
  return PANELS.some((panel) => panel.value === value);
}

/** ComfyUI のタブの右の列を、共通の枠に中身を渡して描く */
export function SidePanel(): React.ReactElement {
  // 実行の操作の失敗のアイコンからも切り替えるので、選んでいるタブはストアに置く
  const tab = useSidePanelStore((state) => state.tab);
  const setTab = useSidePanelStore((state) => state.setTab);
  const report = useRunReport();
  // 埋め込みのダイアログは右に置いたこの列の中身の欄まで広げる
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
      if (isPanel(value)) setTab(value);
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
