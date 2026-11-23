import { PaneDivider } from '@/components/ui/pane-divider';
import { DEFAULT_SIDE_LIST_WIDTH } from '@/lib/dialog-rect';
import { useSettingsStore } from '@/store/use-settings-store';

const DEFAULT_MIN_SIZE = 140;

export interface SidePaneProps {
  readonly paneKey: string;
  readonly label: string;
  readonly side: 'left' | 'right' | 'bottom';
  readonly defaultSize?: number | undefined;
  readonly minSize?: number | undefined;
  readonly maxSize?: number | undefined;
  readonly shrinkable?: boolean | undefined;
  readonly toolbar?: React.ReactNode | undefined;
  readonly children: React.ReactNode;
}

export function usePaneSize(
  paneKey: string,
  defaultSize: number = DEFAULT_SIDE_LIST_WIDTH,
  minSize: number = DEFAULT_MIN_SIZE,
  maxSize: number = Infinity,
): number {
  const stored = useSettingsStore((state) => state.dialogPaneWidths[paneKey] ?? defaultSize);
  return clampPane(stored, minSize, maxSize);
}

export function clampPane(size: number, minSize: number, maxSize: number = Infinity): number {
  return Math.max(minSize, Math.min(maxSize, size));
}

export function SidePane({
  paneKey,
  label,
  side,
  defaultSize = DEFAULT_SIDE_LIST_WIDTH,
  minSize = DEFAULT_MIN_SIZE,
  maxSize = Infinity,
  shrinkable = false,
  toolbar,
  children,
}: SidePaneProps): React.ReactElement {
  const size = usePaneSize(paneKey, defaultSize, minSize, maxSize);
  const setSize = useSettingsStore((state) => state.setDialogPaneWidth);

  const divider = (
    <PaneDivider
      label={label}
      size={size}
      side={side}
      onResize={(next) => setSize(paneKey, clampPane(next, minSize, maxSize))}
    />
  );

  return (
    <>
      {side === 'left' ? null : divider}
      <div
        className="@container flex min-h-0 min-w-0 shrink-0 flex-col"
        style={paneStyleOf(side, size, shrinkable ? minSize : null)}
      >
        {toolbar}
        {children}
      </div>
      {side === 'left' ? divider : null}
    </>
  );
}

function paneStyleOf(side: string, size: number, shrinkTo: number | null): React.CSSProperties {
  if (side === 'bottom') return { height: size };
  return shrinkTo === null ? { width: size } : { width: size, minWidth: shrinkTo, flexShrink: 1 };
}
