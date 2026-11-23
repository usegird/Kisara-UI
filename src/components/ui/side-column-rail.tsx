import { cva } from 'class-variance-authority';

import { DockToggleButton } from '@/components/ui/dock-toggle-button';
import type { SideColumnKit } from '@/components/ui/side-column-kit';
import { cn } from '@/lib/utils';
import type { SidePanelDock } from '@/store/use-settings-store';

const rail = cva('bg-background relative flex shrink-0 items-center gap-1', {
  variants: {
    dock: {
      right: 'col-start-1 row-span-2 row-start-1 w-9 flex-col pt-1 pb-2',
      bottom: 'h-9 flex-1 flex-row border-t px-2',
    },
  },
});

const railButton = cva(
  `relative flex size-7 shrink-0 items-center justify-center rounded focus-visible:outline-2`,
  {
    variants: {
      active: { true: 'bg-muted text-foreground', false: 'text-muted-foreground hover:bg-muted' },
      alert: {
        error: `text-destructive after:bg-destructive after:absolute after:inset-x-1
          after:bottom-0 after:h-[3px] after:rounded-full`,
        warning: `text-foreground after:bg-warning after:absolute after:inset-x-1 after:bottom-0
          after:h-[3px] after:rounded-full`,
        none: '',
      },
    },
  },
);

const railEnd = cva('', { variants: { dock: { right: 'mt-auto', bottom: 'ml-auto' } } });

export interface SideColumnRailProps {
  readonly dock: SidePanelDock;
  readonly kit: SideColumnKit;
  readonly open: boolean;
  readonly onPress: (value: string) => void;
}

export function SideColumnRail({
  dock,
  kit,
  open,
  onPress,
}: SideColumnRailProps): React.ReactElement {
  const hidden = dock === 'right' && open ? 'invisible' : undefined;
  return (
    <div
      className={rail({ dock })}
      role="toolbar"
      aria-label={kit.label}
      aria-orientation={dock === 'right' ? 'vertical' : 'horizontal'}
    >
      {kit.sections.map((section) => (
        <button
          key={section.value}
          type="button"
          aria-label={section.label}
          title={section.label}
          aria-expanded={open && kit.selected === section.value}
          className={cn(
            railButton({
              active: open && kit.selected === section.value,
              alert: section.alert ?? 'none',
            }),
            hidden,
          )}
          onClick={() => onPress(section.value)}
        >
          {kit.renderRailIcon(section.value)}
        </button>
      ))}

      {kit.dockable === false ? null : (
        <DockToggleButton
          className={cn(railButton({ active: false, alert: 'none' }), railEnd({ dock }), hidden)}
        />
      )}
    </div>
  );
}
