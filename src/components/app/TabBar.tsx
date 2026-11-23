import { Menu } from '@base-ui/react/menu';
import { Tabs } from '@base-ui/react/tabs';
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { Activity, ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';

import { dragRangeOf, withinTabs, type DragRange } from '@/components/app/tab-drag-range';
import { TabItem } from '@/components/app/TabItem';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MENU_ITEM_CLASS } from '@/components/ui/menu-item';
import { t } from '@/i18n';
import { traceVerbose } from '@/lib/trace';
import { useDiagnosticsDialogStore } from '@/store/use-diagnostics-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore, type TabLabel } from '@/store/use-tabs-store';

const POINTER_OPTIONS = { activationConstraint: { distance: 5 } };

export interface TabBarProps {
  readonly useTabLabel: (id: string) => TabLabel;
  readonly onRename: (name: string) => void;
  readonly menu?: React.ReactNode;
  readonly moveMenu?: React.ReactNode;
  readonly kinds?: readonly TabKindChoice[] | undefined;
}

interface TabKindChoice {
  readonly key: string;
  readonly label: string;
  readonly onAdd: () => void;
}

function VerboseTraceBadge(): React.ReactElement | null {
  const verbose = useSettingsStore((state) => traceVerbose(state.traceLevels));
  const openDiagnostics = useDiagnosticsDialogStore((state) => state.open);
  if (!verbose) return null;
  return (
    <div className="ml-auto flex shrink-0 items-center pt-1.5 pr-2">
      <button
        type="button"
        className="border-warning/60 text-foreground hover:bg-muted inline-flex items-center gap-1
          rounded-full border px-2 py-0.5 text-xs"
        onClick={openDiagnostics}
      >
        <Activity className="size-3" aria-hidden />
        {t('settings.diagnostics.verbose')}
      </button>
    </div>
  );
}

export function TabBar({
  useTabLabel,
  onRename,
  menu,
  moveMenu,
  kinds,
}: TabBarProps): React.ReactElement {
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const selectTab = useTabsStore((state) => state.selectTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const moveTab = useTabsStore((state) => state.moveTab);
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS));

  const [renaming, setRenaming] = useState(false);
  const [range, setRange] = useState<DragRange | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState<{ id: string; message: string } | null>(null);

  const requestClose = (id: string, confirm: string | null): void => {
    if (confirm !== null) setClosing({ id, message: confirm });
    else closeTab(id);
  };

  return (
    <Tabs.Root
      value={activeId}
      onValueChange={(value) => {
        setRenaming(false);
        selectTab(String(value));
      }}
    >
      <div className="flex h-[38px] items-start">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[withinTabs(range)]}
          onDragStart={(event: DragStartEvent) =>
            setRange(
              dragRangeOf(
                list.current,
                tabs.findIndex((tab) => tab.id === event.active.id),
              ),
            )
          }
          onDragCancel={() => setRange(null)}
          onDragEnd={(event: DragEndEvent) => {
            setRange(null);
            const over = event.over;
            if (over === null) return;
            moveTab(
              String(event.active.id),
              tabs.findIndex((tab) => tab.id === over.id),
            );
          }}
        >
          <Tabs.List
            ref={list}
            className="flex h-[38px] min-w-0 items-start gap-0.5 overflow-x-auto overflow-y-hidden pt-1
          pl-2"
            aria-label={t('app.tabs.list')}
          >
            <SortableContext
              items={tabs.map((tab) => tab.id)}
              strategy={horizontalListSortingStrategy}
            >
              {tabs.map((tab, index) => (
                <TabItem
                  key={tab.id}
                  id={tab.id}
                  active={tab.id === activeId}
                  renaming={renaming}
                  useTabLabel={useTabLabel}
                  menu={menu}
                  moveMenu={moveMenu}
                  onRename={onRename}
                  onStartRename={() => setRenaming(true)}
                  onEndRename={() => setRenaming(false)}
                  onRequestClose={requestClose}
                  index={index}
                  count={tabs.length}
                  onMove={moveTab}
                />
              ))}
            </SortableContext>
          </Tabs.List>
        </DndContext>

        {kinds !== undefined && kinds.length > 0 ? (
          <div className="flex shrink-0 items-center gap-0.5 pt-1 pr-2 pl-0.5">
            <KindMenu kinds={kinds} />
          </div>
        ) : null}

        <VerboseTraceBadge />
      </div>

      <ConfirmDialog
        open={closing !== null}
        title={t('common.unsaved.title')}
        description={closing?.message ?? ''}
        confirmLabel={t('common.ok')}
        onConfirm={() => {
          if (closing !== null) closeTab(closing.id);
          setClosing(null);
        }}
        onCancel={() => setClosing(null)}
      />
    </Tabs.Root>
  );
}

function KindMenu({ kinds }: { readonly kinds: readonly TabKindChoice[] }): React.ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="text-muted-foreground hover:text-foreground rounded p-[5px]"
        aria-label={t('app.tabs.chooseKind')}
        title={t('app.tabs.chooseKind')}
      >
        <ChevronDown className="size-3.5" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" side="bottom" align="start" sideOffset={4}>
          <Menu.Popup
            className="bg-popover text-popover-foreground min-w-36 rounded-md border p-1 text-xs
              shadow-md outline-none"
          >
            {kinds.map((kind) => (
              <Menu.Item key={kind.key} className={MENU_ITEM_CLASS} onClick={kind.onAdd}>
                {kind.label}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
