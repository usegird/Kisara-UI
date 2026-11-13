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

// ─────────────────────────────
// プロンプトの項目の一覧。並べ替えは dnd-kit（キーボードでも動く）。入れられる所の決まりは構成の側
// （dropSlots）に置き、入る先は落とした位置の前後の行で決める。
// ─────────────────────────────

export type { ItemSummary };

/** 開いている項目の中のプレフィルの鍵（項目の id と重ならない） */
export const PREFILL_KEY = ':prefill';

/** プロンプトの項目の一覧の props */
export interface PromptItemListProps {
  readonly chatId: string;
  readonly composition: PromptComposition;
  /** 出さない項目（構成には残す。並べ替えは出している項目の間で行う） */
  readonly hidden?: ((item: PromptItem) => boolean) | undefined;
  /**
   * 項目ごとの見積もり。ふつうは数。メッセージの項目は打つたびに変わるので、打ちかけを購読する要素を
   * 渡す（一覧ごと描き直さない）
   */
  readonly tokens: ReadonlyMap<string, React.ReactNode>;
  /** プレフィルの見積もり。無効なら undefined */
  readonly prefillTokens: number | undefined;
  readonly summary: (item: PromptItem) => ItemSummary;
  /** 項目を足す（プレフィルの下の「項目を追加」から。会話履歴の手前に入れる） */
  readonly onAdd: () => void;
  /** 開いている項目の id（プレフィルは PREFILL_KEY） */
  readonly open: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  /** 項目を消す（取り消しの控えを取ってから消す） */
  readonly onRemove: (id: string) => void;
  /** 項目を追加の下に置くもの（合計と送る中身を見る欄） */
  readonly preview?: React.ReactNode;
  /** 足したばかりで、名前の欄を開いて出す項目の id */
  readonly naming: string | null;
  readonly onNamed: () => void;
  /** 会話履歴の行のすぐ上に置くセッション要約の行 */
  readonly sessionSummary: SessionSummaryRow;
  /** セッション要約の行のすぐ上に置くプレイブックの行（プレイブックのある会話だけ） */
  readonly playbook?: PlaybookPromptRow | undefined;
  /** プレフィルの行のすぐ下に置く行（`messages` の外の `tools`） */
  readonly tools?: React.ReactNode;
}

/** 画面の 1 行（プレフィルは最後に別に置く）と、入れられるか（決まりは構成の側の dropSlots） */
interface Row {
  readonly item: PromptItem;
  readonly slot: DropSlot;
}

/**
 * 履歴の前・会話・履歴の後の段とプレフィルを並べ、運んでいる間は落としたあとの並びをそのまま見せる。
 * role と有効は段の位置と文字の色で表すので、選ぶ欄を出さない
 */
export function PromptItemList(props: PromptItemListProps): React.ReactElement {
  const { chatId, composition, tokens, summary, open, onToggle, onRemove } = props;
  const hidden = props.hidden;
  const rows = sendOrder(rowsOf(composition).filter((row) => hidden?.(row.item) !== true));
  // 並べ替えの並び（画面の順）と、行ごとの入れられるか。セッション要約の行は会話履歴の行の手前に
  // 加わる。運んでいる間も落としたときも、同じ並び（droppedOrder）を使う
  const slots = slotsOf(rows, props.playbook !== undefined);
  const ids = slots.map((slot) => slot.id);
  const kinds = slots.map((slot) => slot.kind);
  // 動かせない行の地のつなぎ方（間に項目を入れられない所だけつなげる）
  const joins = new Map(bandJoins(slots).map((join, at) => [ids[at], join]));
  const joinOf = (id: string): BandJoin => joins.get(id) ?? NO_JOIN;
  // 指せる行（入れられない行は測るが、指しても反応しない）
  const allowed = (id: UniqueIdentifier): boolean => kinds[ids.indexOf(String(id))] !== 'fixed';
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, { coordinateGetter: slotKeyboardCoordinates(allowed) }),
  );
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  // 落としたあと、ほかの行を新しい位置へ滑らせる
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
            {/* 枠も地も付けない文字のボタン。並べ替えの並びには加えない */}
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
              // 項目を追加と送る生データを表示の間も、行の間（4px）だけにする
              <li role="presentation" {...slideKey(':preview')}>
                {props.preview}
              </li>
            )}
          </ol>
        </SortableContext>
        {/* 運んでいる項目の札。列の外（画面の上）に出す */}
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

/** 画面の行の並び。履歴の前の段・会話の段・履歴の後の段の順。入れられるかは dropSlots から引く */
function rowsOf(composition: PromptComposition): Row[] {
  const slots = dropSlots(composition);
  return sectionViews(composition).flatMap((view) =>
    view.items.map((item) => ({ item, slot: slots.get(item.id) ?? 'fixed' })),
  );
}

/**
 * 並べ替えの並びの行と、入れられるか・動かせないか。プレイブックの行とセッション要約の行（会話履歴の
 * 行の手前）とプレフィルの行は構成の項目ではなく、入れられず、動かせない
 */
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

/**
 * 画面の並びを送る順にそろえる。深さ 0 の項目は送るときに今回のメッセージの
 * すぐ後ろに入るので、メッセージの行の下へ移す（メッセージの行が無ければそのまま会話履歴の行の下）
 */
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

/**
 * 落としたあとの並びで、`at` の前（-1）か後ろ（1）の項目の id。プレフィルと端は null。
 * セッション要約の行は構成の項目ではないので飛ばす
 */
function neighbor(order: readonly string[], at: number, step: -1 | 1): string | null {
  const key = order[at + step];
  if (key === SUMMARY_KEY || key === PLAYBOOK_KEY) return neighbor(order, at + step, step);
  return key === undefined || key === PREFILL_KEY ? null : key;
}

/** 掴んだ項目の名前（`useSortable` の data の label） */
function dragLabelOf(data: unknown): string | null {
  if (!isRecord(data)) return null;
  return typeof data.label === 'string' ? data.label : null;
}

/**
 * プレフィルの行（掴めない・無効にしない。本文が無ければ灰色の文字にして、送らないことを
 * 示す）。落とし先にはしない
 */
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
  // 掴めず、落とし先にもしない（指しても反応しない）。並びの最後には加わる
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
