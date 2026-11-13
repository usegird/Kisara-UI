import type {
  ClientRect,
  CollisionDetection,
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  SensorDescriptor,
  SensorOptions,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { useCallback, useRef, useState } from 'react';

import type { DragPreview } from '@/components/comfy/flow/card-outline';
import { groupKeyOfContainer, sortableSlot } from '@/components/comfy/flow/flow-dnd';
import { isOutputDrag, linkFromDrag } from '@/components/comfy/flow/link-dnd';
import { sortKeyOf, useFlowSensors } from '@/components/comfy/flow/use-flow-sensors';
import { useSortCollision, type RectOf } from '@/components/comfy/flow/use-sort-collision';
import type { SortKey } from '@/graph/level-edit';
import type { DropSide } from '@/graph/order-move';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// フロー画面のドラッグ操作（カードとグループの並べ替えと、出力 → パラメータのリンク）。
// ─────────────────────────────

/** カーソルに付けて出すもの。リンクのドラッグ中だけ入る */
interface DraggingChip {
  readonly type: string;
  readonly value: string;
}

/** フロー画面の DndContext に渡す設定と知らせの受け口 */
export interface FlowDnd {
  readonly sensors: SensorDescriptor<SensorOptions>[];
  /** 当たり判定。並べ替えは掴んだときの位置で判定する */
  readonly collisionDetection: CollisionDetection;
  readonly dragging: DraggingChip | null;
  /** 並べ替えで指に付ける写し（掴んだときの見た目）。並べ替えでなければ null */
  readonly ghost: HTMLElement | null;
  /** 枠をまたいでいる間の置き直し。またいでいなければ null */
  readonly preview: DragPreview | null;
  /**
   * 掴んでいる間 `data-dragging` を付ける要素を受け取る（カード・出力チップ・変数のどれでも）。
   * 状態にすると掴んだ瞬間と離した瞬間に画面全体が描き直しになるので、要素へ直接付ける
   */
  readonly draggingRoot: (element: HTMLElement | null) => void;
  readonly onDragStart: (event: DragStartEvent) => void;
  /** 枠をまたいだら、掴んだカードを落とす先へ置き直して見せる */
  readonly onDragMove: (event: DragMoveEvent) => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
  readonly onDragCancel: () => void;
}

/** 落とす先の相手（dnd-kit の `over`、または当たり判定の候補） */
interface DropTarget {
  readonly id: UniqueIdentifier;
  readonly rect: ClientRect | null;
  readonly data: unknown;
}

/**
 * 指している所へ置き直す指定。**元の場所（自分）を指していれば null**（置き直しをやめる）。
 * 何も指していないときは undefined（今の置き直しを保つ）。
 * 相手の前か後ろかは、指している位置（列の外なら列の見えている端。`pointerInView`）が相手の中央より上なら前
 * （落とす先も指している位置で選ぶ。flow-dnd の `sortCollision`）。キーボードでは使わない
 * （`keyboardStep` が並びで数える）。落とす先の受け口で、枠の中へ入るか枠の外かが決まる
 */
function previewAt(
  activeId: UniqueIdentifier,
  over: DropTarget | null,
  y: number | undefined,
  rectOf: RectOf,
): DragPreview | null | undefined {
  const id = sortKeyOf(activeId);
  if (id === null || !over) return undefined;
  if (over.id === activeId) return null;
  const target = rectOf(over.id, over.rect);
  if (y === undefined || !target) return undefined;
  const side: DropSide = y < target.top + target.height / 2 ? 'before' : 'after';
  const group = groupKeyOfContainer(sortableSlot(over.data)?.container);
  const beside = sortKeyOf(over.id);
  return beside === null ? undefined : { id, group, beside, side };
}

/** 鍵を比べられる形に（カードは id、グループは鍵の文字列） */
function toKeyString(key: SortKey): string {
  return typeof key === 'number' ? String(key) : `group:${key.group}`;
}

function samePreview(a: DragPreview | null, b: DragPreview | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    toKeyString(a.id) === toKeyString(b.id) &&
    toKeyString(a.beside) === toKeyString(b.beside) &&
    a.group === b.group &&
    a.side === b.side
  );
}

/**
 * 掴んだものの写し。写しには鍵を残さない（同じ鍵の要素が 2 つにならないように）。
 * 入力欄の値は写らないものがあるが、見た目の目安なので扱わない
 */
function snapshotOf(source: Element | null | undefined): HTMLElement | null {
  if (!source) return null;
  const copy = source.cloneNode(true);
  if (!(copy instanceof HTMLElement)) return null;
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>('[id],[data-sort-id]')]) {
    element.removeAttribute('id');
    element.removeAttribute('data-sort-id');
  }
  copy.style.transform = '';
  copy.style.transition = '';
  copy.style.opacity = '';
  // グループの枠はカードの外側へ広げてある（負の余白）。写しは枠の大きさで置くので打ち消す
  copy.style.marginLeft = '';
  copy.style.marginRight = '';
  return copy;
}

/** 縦に送れる一番近い祖先（カードの列）。無ければ null */
function scrollerOf(element: Element | null | undefined): HTMLElement | null {
  for (let at = element?.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if (overflowY === 'auto' || overflowY === 'scroll') return at;
  }
  return null;
}

function markDragging(element: HTMLElement | null, on: boolean): void {
  element?.toggleAttribute('data-dragging', on);
}

/** 置き直しの状態。`show` は同じ置き直しなら描き直さない。どちらの手続きも作り直さない */
function useDropPreview(
  rectOf: RectOf,
  pointerNow: () => { readonly y: number } | null,
): {
  readonly preview: DragPreview | null;
  readonly show: (next: DragPreview | null) => void;
  readonly shownNow: () => DragPreview | null;
  readonly previewOf: (event: DragMoveEvent | DragEndEvent) => DragPreview | null | undefined;
} {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  // 今の置き直し（手続きの中で読む。購読はしない）
  const shown = useRef<DragPreview | null>(null);
  const show = useCallback((next: DragPreview | null): void => {
    if (samePreview(shown.current, next)) return;
    shown.current = next;
    setPreview(next);
  }, []);
  const shownNow = useCallback(() => shown.current, []);

  /** dnd-kit の知らせから置き直しを決める。指の位置は当たり判定と同じもの */
  const previewOf = useCallback(
    (event: DragMoveEvent | DragEndEvent): DragPreview | null | undefined => {
      const { active, over, activatorEvent, delta } = event;
      if (!(activatorEvent instanceof MouseEvent)) return undefined;
      const y = pointerNow()?.y ?? activatorEvent.clientY + delta.y;
      const target = over ? { id: over.id, rect: over.rect, data: over.data.current } : null;
      return previewAt(active.id, target, y, rectOf);
    },
    [pointerNow, rectOf],
  );
  return { preview, show, shownNow, previewOf };
}

/**
 * フロー画面のドラッグ操作の状態と手続きを持つ。
 * カードの並べ替えとリンクを 1 つの DndContext で受ける。掴む側（出力チップ・変数ボックス）と落とす側
 * （パラメータ行）がカードと変数パネルにまたがり、入れ子の DndContext では相手を見つけられないため。
 * アプリ入力の並べ替えは列の中で完結するので、列が自分の受け口で受ける。
 *
 * 並べ替えは掴んだものの写しを指に付け、元の要素は落とす先へ実際に置き直して薄く見せる。
 * 並びのずらし（dnd-kit の strategy）は同じ受け口の中しか効かず、枠をまたいでいる間は元の位置へ
 * 戻ってしまうので使わない。
 * 落とす先は掴んだときの並びの位置で決める。置き直した後の位置で決めると、枠の伸び縮みで指す先が
 * 行ったり来たりし、測り直しが描画より遅れると別の枠に入る（測り直しのたびに dnd-kit が全カードを
 * 描き直させるので、回数も増える）。
 */
export function useFlowDnd(): FlowDnd {
  // 手続きは手で固定してあり、ここで受ける戻り値を compiler に揃えさせない
  // （揃えると、部品の分け方で描き直しの回数が変わる）
  'use no memo';
  const connect = useGraphStore((state) => state.connect);
  const connectToWidget = useGraphStore((state) => state.connectToWidget);
  const moveSortable = useGraphStore((state) => state.moveSortable);
  const { collisionDetection, rectOf, isSorting, pointerNow, begin, end } = useSortCollision();
  const { preview, show, shownNow, previewOf } = useDropPreview(rectOf, pointerNow);
  const { sensors, isKeyboard, resetKeyboard } = useFlowSensors({ isSorting, show, rectOf });

  const [dragging, setDragging] = useState<DraggingChip | null>(null);
  const root = useRef<HTMLElement | null>(null);
  const draggingRoot = useCallback((element: HTMLElement | null) => {
    root.current = element;
  }, []);

  const [ghost, setGhost] = useState<HTMLElement | null>(null);

  const onDragMove = useCallback(
    (event: DragMoveEvent) => {
      // キーボードでは落とす先を並びで数える（重なりでは決めない）
      if (isKeyboard()) return;
      const next = previewOf(event);
      if (next !== undefined) show(next);
    },
    [isKeyboard, show, previewOf],
  );

  /** 掴み終わり。写しと置き直しを片付け、留めた位置を捨てる */
  const finish = useCallback((): void => {
    setDragging(null);
    setGhost(null);
    show(null);
    markDragging(root.current, false);
    end();
    resetKeyboard(false);
  }, [show, end, resetKeyboard]);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      markDragging(root.current, true);
      const data = event.active.data.current;
      const sort = sortableSlot(data) !== null;
      const source = root.current?.querySelector(
        `[data-sort-id="${CSS.escape(String(event.active.id))}"]`,
      );
      begin(sort, sort ? scrollerOf(source) : null);
      resetKeyboard(event.activatorEvent instanceof KeyboardEvent);
      setDragging(isOutputDrag(data) ? { type: data.type, value: data.value } : null);
      setGhost(sort ? snapshotOf(source) : null);
    },
    [begin, resetKeyboard],
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const placed = shownNow();
      // キーボードでは見せていた所だけ（元の場所なら動かさない）
      const final = isKeyboard() ? placed : (placed ?? previewOf(event) ?? null);
      finish();

      const request = linkFromDrag(event.active.data.current, event.over?.data.current);
      if (request) {
        if (request.widget === null) {
          connect(request.originId, request.originSlot, request.targetId, request.targetSlot);
        } else {
          connectToWidget(request.originId, request.originSlot, request.targetId, request.widget);
        }
        return;
      }

      // 並べ替え。見せていた所へそのまま入れる。まだ置き直していなければ、その場で決める。
      // カードの id は数値（ノード id）、グループは `group:<鍵>` なので、リンク用の id と区別できる
      if (final !== null) moveSortable(final.id, final.beside, final.side);
    },
    [connect, connectToWidget, moveSortable, finish, previewOf, shownNow, isKeyboard],
  );

  return {
    sensors,
    collisionDetection,
    dragging,
    ghost,
    preview,
    draggingRoot,
    onDragStart,
    onDragMove,
    onDragEnd,
    onDragCancel: finish,
  };
}
