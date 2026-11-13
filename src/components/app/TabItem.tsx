import { Tabs } from '@base-ui/react/tabs';
import { useSortable } from '@dnd-kit/sortable';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { TAB_PANEL_ID, tabElementId } from '@/components/app/tab-panel-ids';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { sortableStyle } from '@/components/ui/sortable-style';
import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';
import type { TabLabel } from '@/store/use-tabs-store';

// ─────────────────────────────
// タブバーのタブ 1 枚（札・名前を変える欄・右クリックのメニュー）。
// ─────────────────────────────

/**
 * タブの札。右の列のタブと同じ見た目にする
 */
const tabItem = cva('flex items-center gap-1 rounded-md px-2.5 py-1 text-sm whitespace-nowrap', {
  variants: {
    active: {
      true: 'bg-foreground/10 text-foreground font-medium',
      false: 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
    },
    // 運んでいる札は前に出し、少し薄くする
    dragging: { true: 'relative z-10 opacity-80', false: '' },
  },
  defaultVariants: { dragging: false },
});
/** 札の名前。名前の無いタブは薄く出す */
const tabName = cva('max-w-72 truncate', {
  variants: { unnamed: { true: 'text-muted-foreground', false: '' } },
});

/** 名前が空のときにタブへ出す文字 */
function untitled(): string {
  return t('app.tabs.untitled');
}

function tabNameOf(label: TabLabel): string {
  if (label.name.length > 0) return label.name;
  return label.fallbackName !== undefined && label.fallbackName.length > 0
    ? label.fallbackName
    : untitled();
}

/** タブ 1 枚の props */
export interface TabItemProps {
  readonly id: string;
  readonly active: boolean;
  readonly renaming: boolean;
  readonly useTabLabel: (id: string) => TabLabel;
  readonly menu: React.ReactNode;
  readonly onRename: (name: string) => void;
  readonly onStartRename: () => void;
  readonly onEndRename: () => void;
  /** 閉じる要求。確かめる文を添える（無ければ確かめずに閉じる。確かめるのは呼んだ側） */
  readonly onRequestClose: (id: string, confirm: string | null) => void;
  /** 並びの位置と枚数（メニューの左右へ移すを押せるか） */
  readonly index: number;
  readonly count: number;
  readonly onMove: (id: string, index: number) => void;
}

/** タブ 1 枚。見出しはこのタブの分だけを購読する */
export function TabItem({
  id,
  active,
  renaming,
  useTabLabel,
  menu,
  onRename,
  onStartRename,
  onEndRename,
  onRequestClose,
  index,
  count,
  onMove,
}: TabItemProps): React.ReactElement {
  const label = useTabLabel(id);
  const confirm = label.dirty ? (label.closeMessage ?? t('common.unsaved.close')) : null;
  // 名前を直している間は掴まない（入力の中での選択を運ぶのと取り違えない）
  const editing = active && renaming;
  const { setNodeRef, transform, transition, isDragging, listeners } = useSortable({
    id,
    disabled: editing,
  });

  return (
    <ContextMenuRoot
      onOpenChange={(open) => {
        if (!open) return;
        onEndRename();
      }}
    >
      <ContextMenuTrigger
        ref={setNodeRef}
        className={tabItem({ active, dragging: isDragging })}
        style={sortableStyle(transform, transition)}
        {...listeners}
      >
        {/* 名前の入力はタブの外に置く（ボタンの中に入力を入れない） */}
        {editing ? (
          <input
            autoFocus
            className="focus:border-ring field-sizing-content w-auto max-w-72 min-w-24
            border-0 border-b bg-transparent px-0.5 focus:outline-none"
            value={label.name}
            placeholder={untitled()}
            aria-label={t('app.tabs.nameField')}
            onChange={(event) => onRename(event.target.value)}
            onBlur={onEndRename}
            onKeyDown={(event) => {
              if (entryKeyOf(event) !== null) onEndRename();
            }}
          />
        ) : (
          <Tabs.Tab
            value={id}
            // 中身の欄（外枠の tabpanel）と結ぶ
            id={tabElementId(id)}
            aria-controls={TAB_PANEL_ID}
            className={tabName({ unnamed: label.name.length === 0 })}
            title={active ? t('app.tabs.renameHint') : label.name}
            aria-keyshortcuts="Delete"
            onDoubleClick={() => {
              if (active) onStartRename();
            }}
            onKeyDown={(event) => {
              // キーボードで閉じる（マウスでは右クリックのメニューの「閉じる」）
              if (event.key !== 'Delete') return;
              event.preventDefault();
              onRequestClose(id, confirm);
            }}
          >
            {tabNameOf(label)}
            {label.dirty ? ' *' : ''}
            {label.busy === true ? (
              <Loader2
                className="ml-1 inline size-3 motion-safe:animate-spin align-[-2px]"
                aria-label={label.busyLabel ?? t('app.tabs.receiving')}
              />
            ) : null}
          </Tabs.Tab>
        )}
      </ContextMenuTrigger>

      <ContextMenuContent label={t('app.tabs.menu', { name: tabNameOf(label) })}>
        {active ? menu : null}
        {active && menu ? <ContextMenuSeparator /> : null}
        <ContextMenuItem disabled={index === 0} onClick={() => onMove(id, index - 1)}>
          {t('app.tabs.moveLeft')}
        </ContextMenuItem>
        <ContextMenuItem disabled={index >= count - 1} onClick={() => onMove(id, index + 1)}>
          {t('app.tabs.moveRight')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onRequestClose(id, confirm)}>
          {t('common.close')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuRoot>
  );
}
