import type { NodeId } from '@/graph/types';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// ドラッグ&ドロップでリンクを張るときに dnd-kit の data に載せる形。ここに閉じ、部品の側で作り分けない。
// ─────────────────────────────

/** つかむ側（出力チップ・変数ボックス。どちらもノードの出力スロットなので同じ形）の data */
interface OutputDragData {
  readonly kind: 'output';
  readonly nodeId: NodeId;
  readonly slot: number;
  /** ドラッグ中にカーソルへ添える表示。型は太字、値はそのまま */
  readonly type: string;
  readonly value: string;
}

/** パラメータ行へ落としたとき。`inputs[]` に項目が無ければ足してから繋ぐ */
interface WidgetDropTarget {
  readonly name: string;
  readonly type: string;
}

/** 落とす側（リンクを張れる入力行と、入力に変えられるパラメータ行）の data */
interface InputDropData {
  readonly kind: 'input';
  readonly nodeId: NodeId;
  /** `inputs[]` の位置。パラメータ行は -1（`widget` の名前で指す） */
  readonly slot: number;
  readonly widget: WidgetDropTarget | null;
}

/**
 * つかむ側の id。**カードの出力チップと変数ボックスで別の id にする**
 * （同じ出力でも dnd-kit の登録は id で引くので、重複すると取り違える）。
 */
export function outputDragId(nodeId: NodeId, slot: number, from: 'card' | 'panel'): string {
  return `${from === 'card' ? 'chip' : 'var'}:${nodeId}:${slot}`;
}

/** 落とす側の id。パラメータ行は `widget` の名前で指す */
export function inputDropId(nodeId: NodeId, slot: number, widget: string | null = null): string {
  return widget === null ? `in:${nodeId}:${slot}` : `in:${nodeId}:w:${widget}`;
}

/** つかむ側の data を作る */
export function outputDragData(
  nodeId: NodeId,
  slot: number,
  type: string,
  value: string,
): OutputDragData {
  return { kind: 'output', nodeId, slot, type, value };
}

/** 落とす側の data を作る */
export function inputDropData(
  nodeId: NodeId,
  slot: number,
  widget: WidgetDropTarget | null = null,
): InputDropData {
  return { kind: 'input', nodeId, slot, widget };
}

/** dnd-kit の data がつかむ側の形かを確かめる */
export function isOutputDrag(value: unknown): value is OutputDragData {
  return (
    isRecord(value) &&
    value.kind === 'output' &&
    typeof value.nodeId === 'number' &&
    typeof value.slot === 'number' &&
    typeof value.type === 'string' &&
    typeof value.value === 'string'
  );
}

/** dnd-kit の data が落とす側の形かを確かめる */
export function isInputDrop(value: unknown): value is InputDropData {
  return (
    isRecord(value) &&
    value.kind === 'input' &&
    typeof value.nodeId === 'number' &&
    typeof value.slot === 'number' &&
    // 入れ先の widget が無いときは null が入る
    typeof value.widget === 'object'
  );
}

/** ドラッグの結果から決めた、張るリンク */
interface LinkRequest {
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly targetId: NodeId;
  readonly targetSlot: number;
  /** パラメータ行へ落としたとき。入力に変えてから繋ぐ */
  readonly widget: WidgetDropTarget | null;
}

/**
 * ドラッグ結果から張るリンクを決める。自分自身への接続は作らない。型の不一致は止めない。
 */
export function linkFromDrag(active: unknown, over: unknown): LinkRequest | null {
  if (!isOutputDrag(active) || !isInputDrop(over)) return null;
  if (active.nodeId === over.nodeId) return null;

  return {
    originId: active.nodeId,
    originSlot: active.slot,
    targetId: over.nodeId,
    targetSlot: over.slot,
    widget: over.widget,
  };
}

/** つかむ側の id から、どこから掴んだかを引く。出力のドラッグでなければ null */
export function outputDragSource(id: string | number): 'card' | 'panel' | null {
  if (typeof id !== 'string') return null;
  if (id.startsWith('chip:')) return 'card';
  if (id.startsWith('var:')) return 'panel';
  return null;
}
