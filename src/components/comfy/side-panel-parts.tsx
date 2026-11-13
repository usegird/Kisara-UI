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

// ─────────────────────────────
// 右の列のタブの並びと中身。列のタブと、縮めた行の引き出しで同じものを使う。
// ─────────────────────────────

// 下に置いたときの操作の部品の幅の上限（設定の部品が読む。説明の文は幅いっぱい）
const settingsWidth = cva('', { variants: { wide: { true: '[--control-max:560px]', false: '' } } });

/** 縮めた行のアイコン。エラーには件数を重ねる */
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

/** 右の列のタブ 1 つの中身の props */
export interface SidePanelContentProps {
  /** 描くタブ */
  readonly tab: SidePanelTab;
  /** キューのカードを折り返して並べるか（下に置いたとき） */
  readonly wrap: boolean;
}

/**
 * タブ 1 つの中身。タブごとに受け止める（1 つが描けなくても他のタブは使える）。
 * 列・引き出しの幅や高さを変えても中身は描き直さない（`memo`。中身は自分の購読で動く）。
 * 要素は列の部品が描くたびに `renderContent` から作り直されるので、compiler では揃わない
 */
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
        // 下に置いたときは帯が横に長いので、設定の操作の部品は幅 560px までにする
        <div className={settingsWidth({ wide: wrap })}>
          <SettingsPanel />
        </div>
      )}
    </ErrorBoundary>
  );
});
