import { PanelBottom, PanelRight } from 'lucide-react';

import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

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
