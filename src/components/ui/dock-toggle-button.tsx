import { PanelBottom, PanelRight } from 'lucide-react';

import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

/**
 * 置き場所の切り替え（右と下）。列の右下と、縮めた行の端に置く。
 * 絵は**押したときの行き先**（右にあるときは下、下にあるときは右）。文字は持たない
 */
export function DockToggleButton({
  className,
}: {
  readonly className: string;
}): React.ReactElement {
  const dock = useSettingsStore((state) => state.sidePanelDock);
  const setDock = useSettingsStore((state) => state.setSidePanelDock);
  const next = dock === 'right' ? 'bottom' : 'right';
  const label = t(next === 'bottom' ? 'comfy.side.dockBottom' : 'comfy.side.dockRight');
  const Icon = next === 'bottom' ? PanelBottom : PanelRight;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      onClick={() => setDock(next)}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}
