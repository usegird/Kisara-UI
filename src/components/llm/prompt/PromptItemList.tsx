import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CirclePlus } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import {
  dropSlots,
  isAnchorItem,
  isFixedItem,
  moveToSlot,
  sectionViews,
  type DropSlot,
} from '@/chat/prompt';
import type { PromptComposition, PromptItem } from '@/chat/types';
import {
  PLAYBOOK_KEY,
  PlaybookPromptCard,
  type PlaybookPromptRow,
} from '@/components/llm/playbook/PlaybookPromptCard';
import { CardHeader } from '@/components/llm/prompt/CardHeader';
import { cardRow, NO_JOIN, type BandJoin } from '@/components/llm/prompt/prompt-card-style';
import {
  bandJoins,
  droppedOrder,
  droppedOrderStrategy,
  slotCollision,
  slotKeyboardCoordinates,
} from '@/components/llm/prompt/prompt-item-sorting';
import { LockMark, PromptItemCard, type ItemSummary } from '@/components/llm/prompt/PromptItemCard';
import { PrefillEditor } from '@/components/llm/prompt/PromptItemEditor';
import {
  SUMMARY_KEY,
  SummaryCard,
  type SessionSummaryRow,
} from '@/components/llm/prompt/SummaryCard';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { sortableStyle } from '@/components/ui/sortable-style';
import { slideKey, useReorderSlide } from '@/hooks/ui/use-reorder-slide';
import { t } from '@/i18n';
import { isRecord } from '@/lib/guards';
import { useChatStore } from '@/store/use-chat-store';

export type { ItemSummary };

export const PREFILL_KEY = ':prefill';

export interface PromptItemListProps {
  readonly chatId: string;
  readonly composition: PromptComposition;
  readonly hidden?: ((item: PromptItem) => boolean) | undefined;
  readonly tokens: ReadonlyMap<string, React.ReactNode>;
  readonly prefillTokens: number | undefined;
  readonly summary: (item: PromptItem) => ItemSummary;
  readonly onAdd: () => void;
  readonly open: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly preview?: React.ReactNode;
  readonly naming: string | null;
  readonly onNamed: () => void;
  readonly sessionSummary: SessionSummaryRow;
  readonly playbook?: PlaybookPromptRow | undefined;
  readonly tools?: React.ReactNode;
}

interface Row {
  readonly item: PromptItem;
  readonly slot: DropSlot;
}

export function PromptItemList(props: PromptItemListProps): React.ReactElement {
  const { chatId, composition, tokens, summary, open, onToggle, onRemove } = props;
  const hidden = props.hidden;
  const rows = sendOrder(rowsOf(composition).filter((row) => hidden?.(row.item) !== true));
  const slots = slotsOf(rows, props.playbook !== undefined);
  const ids = slots.map((slot) => slot.id);
  const kinds = slots.map((slot) => slot.kind);
  const joins = new Map(bandJoins(slots).map((join, at) => [ids[at], join]));
  const joinOf = (id: string): BandJoin => joins.get(id) ?? NO_JOIN;
  const allowed = (id: UniqueIdentifier): boolean => kinds[ids.indexOf(String(id))] !== 'fixed';
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, { coordinateGetter: slotKeyboardCoordinates(allowed) }),
  );
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const { attachSlideList, remember } = useReorderSlide();
  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    setDragLabel(null);
    if (over === null || active.id === over.id) return;
    const id = String(active.id);
    const order = droppedOrder(ids, kinds, ids.indexOf(id), ids.indexOf(String(over.id)));
    const at = order.indexOf(id);
    remember(id);
    useChatStore
      .getState()
      .updatePrompt(chatId, (prompt) =>
        moveToSlot(prompt, id, neighbor(order, at, -1), neighbor(order, at, 1)),
      );
  };

  return (
    <div className="flex flex-col gap-1">
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragLabel(dragLabelOf(active.data.current))}
        onDragCancel={() => setDragLabel(null)}
        collisionDetection={slotCollision(allowed)}
        accessibility={dragAccessibility()}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={ids} strategy={droppedOrderStrategy(kinds)}>
          <ol ref={attachSlideList} className="flex flex-col gap-1">
            {rows.map((row) => [
              row.item.marker === 'chatHistory' && props.playbook !== undefined ? (
                <PlaybookPromptCard
                  key={PLAYBOOK_KEY}
                  row={props.playbook}
                  open={open.has(PLAYBOOK_KEY)}
                  onToggle={() => onToggle(PLAYBOOK_KEY)}
                  join={joinOf(PLAYBOOK_KEY)}
                />
              ) : null,
              row.item.marker === 'chatHistory' ? (
                <SummaryCard
                  key={SUMMARY_KEY}
                  chatId={chatId}
                  row={props.sessionSummary}
                  open={open.has(SUMMARY_KEY)}
                  onToggle={() => onToggle(SUMMARY_KEY)}
                  join={joinOf(SUMMARY_KEY)}
                />
              ) : null,
              <PromptItemCard
                key={row.item.id}
                chatId={chatId}
                item={row.item}
                tokens={tokens.get(row.item.id)}
                summary={summary(row.item)}
                open={open.has(row.item.id)}
                onToggle={onToggle}
                onRemove={onRemove}
                naming={props.naming === row.item.id}
                onNamed={props.onNamed}
                slot={row.slot}
                join={joinOf(row.item.id)}
              />,
            ])}
            <PrefillCard
              {...props}
              join={{ ...joinOf(PREFILL_KEY), joinDown: props.tools !== undefined }}
            />
            {props.tools === undefined ? null : (
              <li role="presentation" {...slideKey(':tools')}>
                {props.tools}
              </li>
            )}
            <li role="presentation" {...slideKey(':add')}>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1
                  rounded-sm px-1 py-1"
                onClick={props.onAdd}
              >
                <CirclePlus className="size-3.5" aria-hidden />
                {t('llm.prompt.add')}
              </button>
            </li>
            {props.preview === undefined ? null : (
              <li role="presentation" {...slideKey(':preview')}>
                {props.preview}
              </li>
            )}
          </ol>
        </SortableContext>
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {dragLabel === null ? null : (
              <div className="bg-popover text-popover-foreground rounded-md border px-2 py-1 text-xs shadow-md">
                {dragLabel}
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </div>
  );
}

function rowsOf(composition: PromptComposition): Row[] {
  const slots = dropSlots(composition);
  return sectionViews(composition).flatMap((view) =>
    view.items.map((item) => ({ item, slot: slots.get(item.id) ?? 'fixed' })),
  );
}

function slotsOf(
  rows: readonly Row[],
  playbook: boolean,
): { readonly id: string; readonly kind: DropSlot; readonly locked: boolean }[] {
  const before = [
    ...(playbook ? [{ id: PLAYBOOK_KEY, kind: 'fixed' as const, locked: true }] : []),
    { id: SUMMARY_KEY, kind: 'fixed' as const, locked: true },
  ];
  return [
    ...rows.flatMap((row) => [
      ...(row.item.marker === 'chatHistory' ? before : []),
      {
        id: row.item.id,
        kind: row.slot,
        locked: isFixedItem(row.item) || isAnchorItem(row.item),
      },
    ]),
    { id: PREFILL_KEY, kind: 'fixed', locked: true },
  ];
}

function sendOrder(rows: readonly Row[]): Row[] {
  const depthZero = (row: Row): boolean =>
    row.item.position.kind === 'depth' && row.item.position.depth === 0;
  if (!rows.some((row) => row.item.marker === 'currentInput')) return [...rows];
  const zero = rows.filter(depthZero);
  return rows.flatMap((row) => {
    if (depthZero(row)) return [];
    return row.item.marker === 'currentInput' ? [row, ...zero] : [row];
  });
}

function neighbor(order: readonly string[], at: number, step: -1 | 1): string | null {
  const key = order[at + step];
  if (key === SUMMARY_KEY || key === PLAYBOOK_KEY) return neighbor(order, at + step, step);
  return key === undefined || key === PREFILL_KEY ? null : key;
}

function dragLabelOf(data: unknown): string | null {
  if (!isRecord(data)) return null;
  return typeof data.label === 'string' ? data.label : null;
}

function PrefillCard({
  chatId,
  composition,
  prefillTokens,
  open,
  onToggle,
  join,
}: PromptItemListProps & { readonly join: BandJoin }): React.ReactElement {
  const prefill = composition.prefill;
  const empty = prefill.content.length === 0;
  const isOpen = open.has(PREFILL_KEY);
  const { setNodeRef, transform, transition } = useSortable({
    id: PREFILL_KEY,
    disabled: { draggable: true, droppable: false },
  });
  return (
    <li
      ref={setNodeRef}
      style={sortableStyle(transform, transition)}
      className={cardRow({ enabled: !empty, dragging: false, locked: true, ...join })}
      {...slideKey(PREFILL_KEY)}
    >
      <CardHeader
        label={t('llm.prompt.prefill')}
        position={null}
        tokens={empty ? undefined : prefillTokens}
        summary={prefill.content.trim().split('\n')[0] ?? ''}
        open={isOpen}
        onToggle={() => onToggle(PREFILL_KEY)}
        grip={<LockMark />}
      />
      {isOpen ? (
        <div>
          <PrefillEditor chatId={chatId} content={prefill.content} />
        </div>
      ) : null}
    </li>
  );
}
