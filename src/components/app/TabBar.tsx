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

// ─────────────────────────────
// タブバー。種別の違うタブを 1 段に並べ、切り替え・名前の変更・並べ替え・閉じるを持つ。
// 見出しは種別の層が `useTabLabel` で渡し、外殻は種別の状態を読まない。
// ─────────────────────────────

/** 押しただけで掴まない（押すのはタブの切り替え） */
const POINTER_OPTIONS = { activationConstraint: { distance: 5 } };

/** タブバーの props */
export interface TabBarProps {
  /**
   * タブ 1 枚の見出しを読むフック。種別の層が渡す（アクティブなタブは生の値、他は控え）。
   * タブ 1 枚ごとに呼ぶので、見出しの変化はそのタブだけが描き直す
   */
  readonly useTabLabel: (id: string) => TabLabel;
  /** アクティブなタブの名前を変える */
  readonly onRename: (name: string) => void;
  /** 右クリックメニューに差し込む項目。アクティブなタブに効くものを渡す */
  readonly menu?: React.ReactNode;
  /** タブの並びの右の ▾ に並べるタブの種類。新しいタブはここからだけ開く */
  readonly kinds?: readonly TabKindChoice[] | undefined;
}

/** 足せるタブの種類。名前は訳したもの */
interface TabKindChoice {
  readonly key: string;
  readonly label: string;
  readonly onAdd: () => void;
}

/**
 * どこかの分野が `debug` の間だけ出す。押すと診断ファイルのダイアログを開く
 */
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

/**
 * タブの並び・種類の ▾・詳しいログの印。矢印キーでの移動と焦点の持ち回りは Base UI の Tabs に、
 * 並べ替えは dnd-kit に任せる（キーボードではメニューの「左へ移す・右へ移す」）
 */
export function TabBar({ useTabLabel, onRename, menu, kinds }: TabBarProps): React.ReactElement {
  const tabs = useTabsStore((state) => state.tabs);
  const activeId = useTabsStore((state) => state.activeId);
  const selectTab = useTabsStore((state) => state.selectTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const moveTab = useTabsStore((state) => state.moveTab);
  const sensors = useSensors(useSensor(PointerSensor, POINTER_OPTIONS));

  const [renaming, setRenaming] = useState(false);
  // 運んでいる間だけ、運べる範囲を持つ（掴んだときに測る）
  const [range, setRange] = useState<DragRange | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState<{ id: string; message: string } | null>(null);

  /** 保存していない編集を捨てることになるときだけ確かめる */
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
      {/* tablist の中にはタブだけを置く（WCAG 1.3.1）。dnd-kit の読み上げの領域と ▾ は外に出す */}
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
            // 高さを決めておき、溢れて横のスクロールバー（6px）が出ても札の下の間隔を広げない。
            // 札の下端（32px）より下はヘッダーの外（本体の上の余白）にはみ出し、スクロールバーだけが入る
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

        {/* 新しいタブは ▾ で種類を選んで開く（＋ は置かない） */}
        {kinds !== undefined && kinds.length > 0 ? (
          <div className="flex shrink-0 items-center gap-0.5 pt-1 pr-2 pl-0.5">
            <KindMenu kinds={kinds} />
          </div>
        ) : null}

        {/* 詳しいログを取っている間の印 */}
        <VerboseTraceBadge />
      </div>

      {/* 保存していない編集は戻せないので、閉じる前に確かめる */}
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

/** タブの並びの右の ▾。選んだ種類の空のタブを開く。開閉と矢印キーは Base UI に任せる */
function KindMenu({ kinds }: { readonly kinds: readonly TabKindChoice[] }): React.ReactElement {
  return (
    <Menu.Root>
      {/* 絵 14px に余白 5px で、押せる大きさの基準 24px を満たす（WCAG 2.5.8） */}
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
