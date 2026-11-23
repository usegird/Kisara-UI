import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { createContext, useContext, useRef, useState } from 'react';

import { AnchorContext, groupAnchorKey } from '@/components/comfy/flow/anchor-context';
import { ColumnZoomContext } from '@/components/comfy/flow/column-zoom-context';
import {
  GROUP_TAB_HEIGHT,
  groupContainerId,
  groupSortId,
  keepInPlace,
  noLayoutAnimation,
} from '@/components/comfy/flow/flow-dnd';
import {
  GROUP_FRAME_PADDING,
  GROUP_FRAME_PADDING_BOTTOM,
  GROUP_FRAME_PADDING_TOP,
  groupTone,
} from '@/components/comfy/flow/group-frame-look';
import { GroupBypassMenuItems } from '@/components/comfy/flow/GroupBypassMenuItems';
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { sortableAttributes } from '@/components/ui/drag-announcements';
import { DRAGGING_Z_INDEX } from '@/components/ui/sortable-style';
import type { GroupLabel } from '@/graph/groups';
import { DEFAULT_GROUP_COLOR, NODE_COLOR_OPTIONS } from '@/graph/node-settings';
import type { NodeId } from '@/graph/types';
import { t } from '@/i18n';
import { paintableColor, toHexColor } from '@/lib/color';
import { entryKeyOf } from '@/lib/text-entry';
import { zoomedTransform } from '@/store/settings-fields/column-zoom';

const DROP_TARGET_OPACITY = 0.4;

export interface CardGroupFrameProps {
  readonly label: GroupLabel;
  readonly items: readonly (NodeId | string)[];
  readonly memberIds: readonly NodeId[];
  readonly onRename: (key: string, title: string) => void;
  readonly onUngroup: (key: string) => void;
  readonly onDeleteMembers?: ((ids: readonly NodeId[]) => void) | undefined;
  readonly onConvertToSubgraph?: ((key: string) => void) | undefined;
  readonly onColorChange: (key: string, color: string | null) => void;
  readonly children: React.ReactNode;
}

const InsideFrameContext = createContext(false);

function framePadding(side: number): string {
  return [GROUP_FRAME_PADDING_TOP, side, GROUP_FRAME_PADDING_BOTTOM]
    .map((value) => `${String(value)}px`)
    .join(' ');
}

export function CardGroupFrame({
  label,
  items,
  memberIds,
  onRename,
  onUngroup,
  onDeleteMembers,
  onConvertToSubgraph,
  onColorChange,
  children,
}: CardGroupFrameProps): React.ReactElement {
  const sortable = useSortable({
    id: groupSortId(label.key),
    data: { label: label.title },
    attributes: sortableAttributes(),
    animateLayoutChanges: noLayoutAnimation,
  });
  const zoom = useContext(ColumnZoomContext);
  const pad = GROUP_FRAME_PADDING;
  const nested = useContext(InsideFrameContext);
  const outside = nested ? 0 : -pad;
  const tone = groupTone(label.color);
  const anchors = useContext(AnchorContext);
  const attachAnchor = anchors?.register(groupAnchorKey(label.key));
  const picker = useGroupColorPicker(label.key, onColorChange);

  return (
    <li
      ref={(element) => {
        sortable.setNodeRef(element);
        attachAnchor?.(element);
      }}
      data-sort-id={groupSortId(label.key)}
      className="relative"
      style={{
        paddingTop: GROUP_TAB_HEIGHT,
        marginLeft: outside,
        marginRight: outside,
        transform: CSS.Transform.toString(zoomedTransform(sortable.transform, zoom)),
        transition: sortable.transition,
        zIndex: sortable.isDragging ? DRAGGING_Z_INDEX : undefined,
        opacity: sortable.isDragging ? DROP_TARGET_OPACITY : undefined,
      }}
      aria-label={t('flow.cardGroup.label', { title: label.title })}
    >
      <ContextMenuRoot>
        <ContextMenuTrigger
          className="absolute top-0 left-0 flex max-w-[70%] items-center gap-0.5 rounded-t-md
            pr-1.5 pl-0.5"
          style={{ ...tone.tab, height: GROUP_TAB_HEIGHT }}
        >
          <button
            type="button"
            className="text-foreground -m-[3px] cursor-grab rounded p-[5px]"
            aria-label={t('flow.cardGroup.reorder', { title: label.title })}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </button>
          <GroupTitle label={label} onRename={onRename} />
        </ContextMenuTrigger>
        <ContextMenuContent label={t('flow.cardGroup.menu', { title: label.title })}>
          <GroupColorMenu label={label} onColorChange={onColorChange} onPickColor={picker.open} />
          <GroupBypassMenuItems memberIds={memberIds} />
          <ContextMenuSeparator />
          <ContextMenuItem
            title={t('flow.cardGroup.ungroupTitle')}
            onClick={() => onUngroup(label.key)}
          >
            {t('flow.cardGroup.ungroup')}
          </ContextMenuItem>
          {onConvertToSubgraph ? (
            <ContextMenuItem
              title={t('flow.cardGroup.toSubgraphTitle')}
              onClick={() => onConvertToSubgraph(label.key)}
            >
              {t('flow.cardGroup.toSubgraph')}
            </ContextMenuItem>
          ) : null}
          {onDeleteMembers ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                title={t('flow.cardGroup.deleteGroupTitle')}
                onClick={() => onDeleteMembers(memberIds)}
              >
                {t('flow.cardGroup.deleteGroup')}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenuRoot>
      {picker.input}

      <div
        className="rounded-lg rounded-tl-none"
        style={{ ...tone.frame, padding: framePadding(pad) }}
      >
        <SortableContext
          id={groupContainerId(label.key)}
          items={items as (NodeId | string)[]}
          strategy={keepInPlace}
        >
          <InsideFrameContext value={true}>
            <ol className="flex flex-col gap-3">{children}</ol>
          </InsideFrameContext>
        </SortableContext>
      </div>
    </li>
  );
}

const NO_COLOR = '';
const CUSTOM_COLOR = 'custom';

function GroupColorMenu({
  label,
  onColorChange,
  onPickColor,
}: Pick<CardGroupFrameProps, 'label' | 'onColorChange'> & {
  readonly onPickColor: (current: string | null) => void;
}): React.ReactElement {
  const current = label.color ?? null;
  const choice =
    current === null
      ? NO_COLOR
      : (NODE_COLOR_OPTIONS.find((option) => option.groupcolor === current)?.key ?? CUSTOM_COLOR);
  const swatch = paintableColor(current);

  return (
    <ContextMenuSubmenu label={t('flow.style.color')}>
      <ContextMenuRadioGroup
        value={choice}
        onValueChange={(key: string) => {
          const option = NODE_COLOR_OPTIONS.find((candidate) => candidate.key === key);
          onColorChange(label.key, option ? option.groupcolor : null);
        }}
      >
        <ContextMenuRadioItem value={NO_COLOR}>{t('flow.style.defaultColor')}</ContextMenuRadioItem>
        {NODE_COLOR_OPTIONS.map((option) => (
          <ContextMenuRadioItem key={option.key} value={option.key} swatch={option.groupcolor}>
            {option.label}
          </ContextMenuRadioItem>
        ))}
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => onPickColor(current)}>
        <span className="flex items-center gap-2 pl-[22px]">
          {choice === CUSTOM_COLOR && swatch !== null ? (
            <span
              aria-hidden
              className="border-border size-3.5 shrink-0 rounded-sm border"
              style={{ backgroundColor: swatch }}
            />
          ) : null}
          {t('flow.style.custom')}
        </span>
      </ContextMenuItem>
    </ContextMenuSubmenu>
  );
}

function useGroupColorPicker(
  key: string,
  onColorChange: CardGroupFrameProps['onColorChange'],
): { readonly open: (current: string | null) => void; readonly input: React.ReactNode } {
  const ref = useRef<HTMLInputElement | null>(null);

  const open = (current: string | null): void => {
    const element = ref.current;
    if (!element) return;
    element.value = (current === null ? null : toHexColor(current)) ?? DEFAULT_GROUP_COLOR;
    try {
      element.showPicker();
    } catch {
      element.click();
    }
  };

  const input = (
    <input
      ref={ref}
      type="color"
      tabIndex={-1}
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 size-0 opacity-0"
      onChange={(event) => {
        const hex = toHexColor(event.target.value);
        if (hex) onColorChange(key, hex);
      }}
    />
  );

  return { open, input };
}

function GroupTitle({
  label,
  onRename,
}: Pick<CardGroupFrameProps, 'label' | 'onRename'>): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        className="hover:border-input min-w-0 cursor-text truncate rounded border
          border-transparent px-1 text-left text-2xs font-semibold"
        title={label.title}
        aria-label={t('flow.cardGroup.rename', { title: label.title })}
        onClick={() => setDraft(label.title)}
      >
        {label.title}
      </button>
    );
  }

  const commit = (): void => {
    const title = draft.trim();
    if (title.length > 0 && title !== label.title) onRename(label.key, title);
    setDraft(null);
  };

  return (
    <input
      ref={(element) => {
        if (element === null || element === document.activeElement) return;
        element.focus();
        element.select();
      }}
      className="border-input min-w-0 rounded border bg-transparent px-1 text-2xs font-semibold
        focus:border-ring focus:outline-none"
      value={draft}
      aria-label={t('flow.cardGroup.name', { title: label.title })}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        const key = entryKeyOf(event);
        if (key === 'commit') event.currentTarget.blur();
        if (key === 'cancel') setDraft(null);
      }}
    />
  );
}
