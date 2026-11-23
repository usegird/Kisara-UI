import { Tabs } from '@base-ui/react/tabs';
import { cva } from 'class-variance-authority';

import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { cn } from '@/lib/utils';
import type { SidePanelDock } from '@/store/use-settings-store';

const tabLabel = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-sm whitespace-nowrap',
  {
    variants: {
      dock: { right: '', bottom: '' },
      active: {
        true: 'bg-foreground/10 text-foreground font-medium',
        false: 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
      },
      alert: {
        error: `text-destructive after:bg-destructive relative font-semibold after:absolute
          after:inset-x-1.5 after:bottom-0 after:h-[3px] after:rounded-full`,
        warning: `text-foreground after:bg-warning relative font-semibold after:absolute
          after:inset-x-1.5 after:bottom-0 after:h-[3px] after:rounded-full`,
        none: '',
      },
    },
  },
);

const tabsRoot = cva('min-h-0 flex-1', {
  variants: {
    dock: { right: 'flex-col', bottom: 'flex-row' },
    rows: { subgrid: 'row-span-2 grid grid-rows-subgrid', own: 'flex' },
  },
});

const tabList = cva('flex', {
  variants: {
    dock: {
      right: 'shrink-0 items-center gap-0.5',
      bottom: 'min-w-[4.5rem] shrink-0 flex-col gap-0.5 pr-2',
    },
    rows: { subgrid: 'min-w-max self-start', own: '' },
  },
  compoundVariants: [{ dock: 'right', rows: 'own', className: 'min-w-0 pb-2' }],
});

const panelArea = cva(
  'bg-pane relative flex min-h-0 min-w-0 flex-1 flex-col rounded-md [contain:inline-size]',
  { variants: { rows: { subgrid: 'mt-2', own: '' } } },
);
const BOTTOM_PIN = 'absolute top-1 right-1 flex';
const BOTTOM_DOCK = 'absolute right-1 bottom-1 flex';

const panelBody = cva('min-h-0 min-w-0 overflow-y-auto p-2', {
  variants: {
    active: { true: 'flex-1', false: 'hidden' },
    dock: { right: '', bottom: 'pr-16 pl-5' },
  },
});

export interface SideColumnTabsProps {
  readonly kit: SideColumnKit;
  readonly dock: SidePanelDock;
  readonly rows: 'subgrid' | 'own';
  readonly pin: React.ReactNode;
  readonly dockToggle: React.ReactNode;
  readonly attachPanel?: ((element: HTMLElement | null) => void) | undefined;
  readonly attachTabs?: ((element: HTMLElement | null) => void) | undefined;
}

export function SideColumnTabs({
  dock,
  rows,
  kit,
  pin,
  dockToggle,
  attachPanel,
  attachTabs,
}: SideColumnTabsProps): React.ReactElement {
  const list = (
    <Tabs.List ref={attachTabs} className={tabList({ dock, rows })} aria-label={kit.label}>
      {kit.sections.map((section) => (
        <Tabs.Tab
          key={section.value}
          value={section.value}
          className={cn(
            tabLabel({
              dock,
              active: kit.selected === section.value,
              alert: section.alert ?? 'none',
            }),
          )}
        >
          {section.label}
          {kit.renderTabExtra?.(section.value)}
        </Tabs.Tab>
      ))}
    </Tabs.List>
  );
  return (
    <Tabs.Root
      value={kit.selected}
      onValueChange={(value) => {
        const next = kit.sections.find((section) => section.value === value);
        if (next) kit.onSelect(next.value);
      }}
      orientation={dock === 'bottom' ? 'vertical' : 'horizontal'}
      className={tabsRoot({ dock, rows })}
    >
      {list}

      <div ref={attachPanel} className={panelArea({ rows })}>
        {kit.sections.map((section) => (
          <Tabs.Panel
            key={section.value}
            value={section.value}
            className={panelBody({ active: kit.selected === section.value, dock })}
          >
            {kit.selected !== section.value
              ? null
              : kit.renderContent(section.value, dock === 'bottom')}
          </Tabs.Panel>
        ))}
        {dock === 'right' ? (
          <div className="flex shrink-0 items-center gap-1 px-1 pb-1">
            {pin}
            {dockToggle}
          </div>
        ) : (
          <>
            <div className={BOTTOM_PIN}>{pin}</div>
            {dockToggle === null ? null : <div className={BOTTOM_DOCK}>{dockToggle}</div>}
          </>
        )}
      </div>
    </Tabs.Root>
  );
}
