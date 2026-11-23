import { cva } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';

import { ColumnDivider } from '@/components/ui/column-divider';
import { DockToggleButton } from '@/components/ui/dock-toggle-button';
import { HeightHandle } from '@/components/ui/height-handle';
import { PinButton } from '@/components/ui/pin-button';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { SideColumnRail } from '@/components/ui/side-column-rail';
import { SideColumnTabs } from '@/components/ui/side-column-tabs';
import { widenFromShown, type ColumnKey } from '@/store/settings-fields/column-widths';
import {
  MAX_SIDE_PANEL_HEIGHT,
  MIN_SIDE_PANEL_HEIGHT,
} from '@/store/settings-fields/side-panel-height';
import { useSettingsStore, type SidePanelDock } from '@/store/use-settings-store';

const frame = cva('shrink-0', {
  variants: {
    dock: { right: 'min-w-min items-stretch', bottom: '' },
    rows: {
      subgrid: 'row-span-2 grid grid-cols-[auto_minmax(min-content,1fr)] grid-rows-subgrid',
      own: 'flex',
    },
    floating: {
      true: `bg-background animate-in z-30 shadow-lg animation-duration-150 will-change-transform
        motion-reduce:animate-none`,
      false: 'relative',
    },
  },
  compoundVariants: [
    { dock: 'bottom', floating: false, className: 'max-h-[85%]' },
    {
      dock: 'right',
      floating: true,
      className: 'slide-in-from-right relative col-start-1 row-start-1 justify-self-end',
    },
    {
      dock: 'bottom',
      floating: true,
      className: 'slide-in-from-bottom absolute inset-x-0 bottom-full [contain:layout_style]',
    },
  ],
});
const body = cva('relative min-w-0 flex-1 overflow-hidden', {
  variants: {
    dock: { right: 'pt-1 pr-column-gutter pl-1', bottom: 'border-t' },
    bottomEdge: { scrollbar: '', input: '' },
    rows: { subgrid: 'row-span-2 grid grid-rows-subgrid', own: 'flex flex-col' },
  },
  compoundVariants: [
    { dock: 'right', bottomEdge: 'scrollbar', className: 'pb-2.5' },
    { dock: 'right', bottomEdge: 'input', className: 'pb-column-bottom' },
  ],
});

const DOCK_ICON_CLASS = `text-muted-foreground hover:text-foreground hover:bg-muted ml-auto flex
  size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2`;

export interface SideColumnProps {
  readonly kit: SideColumnKit;
}

const collapsedRoot = cva('shrink-0', {
  variants: {
    dock: {
      right: 'row-span-2 grid grid-cols-[2.25rem] grid-rows-subgrid',
      bottom: 'relative flex',
    },
  },
});

export function SideColumn({ kit }: SideColumnProps): React.ReactElement {
  const storedDock = useSettingsStore((state) => state.sidePanelDock);
  const dock: SidePanelDock = kit.dockable === false ? 'right' : storedDock;
  const collapsed = useSettingsStore((state) => state.sidePanelCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed || !drawerOpen) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && container.current?.contains(target) === true) return;
      setDrawerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [collapsed, drawerOpen]);

  if (!collapsed) return <SideColumnFrame dock={dock} kit={kit} floating={false} />;

  const press = (value: string): void => {
    if (drawerOpen && kit.selected === value) {
      setDrawerOpen(false);
      return;
    }
    kit.onSelect(value);
    setDrawerOpen(true);
  };

  return (
    <div ref={container} className={collapsedRoot({ dock })}>
      <SideColumnRail dock={dock} kit={kit} open={drawerOpen} onPress={press} />
      {drawerOpen ? (
        <SideColumnFrame dock={dock} kit={kit} floating onPinned={() => setDrawerOpen(false)} />
      ) : null}
    </div>
  );
}

interface SideColumnFrameProps extends SideColumnProps {
  readonly dock: SidePanelDock;
  readonly floating: boolean;
  readonly onPinned?: (() => void) | undefined;
}

function SideColumnFrame({
  dock,
  kit,
  floating,
  onPinned,
}: SideColumnFrameProps): React.ReactElement {
  const widthKey = kit.widthKey ?? 'queue';
  const width = useSettingsStore((state) => state.columnWidths[widthKey]);
  const resizeColumn = useSettingsStore((state) => state.resizeColumn);
  const setCollapsed = useSettingsStore((state) => state.setSidePanelCollapsed);
  const height = useSettingsStore((state) => state.sidePanelHeight);
  const setHeight = useSettingsStore((state) => state.setSidePanelHeight);
  const frameElement = useRef<HTMLDivElement>(null);
  const resizeShown = (column: ColumnKey, delta: number): void => {
    const shown = frameElement.current?.offsetWidth ?? 0;
    const current = useSettingsStore.getState().columnWidths[column];
    resizeColumn(column, widenFromShown(current, shown, delta));
  };
  const togglePin = (): void => {
    onPinned?.();
    setCollapsed(!floating);
  };
  const rows = dock === 'right' ? 'subgrid' : 'own';

  return (
    <div
      ref={frameElement}
      role={floating ? 'region' : 'complementary'}
      aria-label={
        floating
          ? (kit.sections.find((section) => section.value === kit.selected)?.label ?? kit.label)
          : kit.label
      }
      style={dock === 'right' ? { width } : { height }}
      className={frame({ dock, floating, rows })}
    >
      {dock === 'right' ? (
        <div className="row-span-2 flex">
          <ColumnDivider
            column={widthKey}
            label={kit.label}
            width={width}
            side="right"
            onResize={resizeShown}
          />
        </div>
      ) : null}

      <div className={body({ dock, bottomEdge: kit.bottomEdge ?? 'scrollbar', rows })}>
        {dock === 'bottom' ? (
          <div className="relative h-0 shrink-0">
            <HeightHandle
              label={kit.label}
              height={height}
              min={MIN_SIDE_PANEL_HEIGHT}
              max={MAX_SIDE_PANEL_HEIGHT}
              edge="top"
              onChange={setHeight}
            />
          </div>
        ) : null}
        <SideColumnTabs
          dock={dock}
          rows={rows}
          kit={kit}
          pin={<PinButton pinned={!floating} onToggle={togglePin} />}
          attachPanel={floating ? undefined : kit.attachPanel}
          attachTabs={floating ? undefined : kit.attachTabs}
          dockToggle={
            kit.dockable === false ? null : <DockToggleButton className={DOCK_ICON_CLASS} />
          }
        />
      </div>
    </div>
  );
}
