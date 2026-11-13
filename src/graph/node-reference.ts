import type { NodeView } from '@/graph/rows';
import { slotTypeMatches } from '@/graph/search';
import type { NodeId } from '@/graph/types';
import { matchesAnyTerm, searchTerms } from '@/lib/search-terms';

// ─────────────────────────────
// ノード参照（既にあるノードへ繋ぐときの候補）の組み立て。並びはカードの並び（通し番号の順）のまま。
// ─────────────────────────────

/** どちら側を並べるか。`outputs`=接続元を選ぶ / `inputs`=接続先を選ぶ */
export type ReferenceSide = 'outputs' | 'inputs';

/** ノード参照の候補 1 つ（あるノードの出力か、線を受けられる入力） */
export interface ReferenceSlot {
  /** 一覧の鍵（同じ名前の口が同じノードに複数あっても重ならない） */
  readonly key: string;
  readonly nodeId: NodeId;
  /** ノードの通し番号。注記など番号を持たないものは null */
  readonly nodeIndex: string | null;
  /** コメントがあればコメント、無ければノード名 */
  readonly nodeLabel: string;
  /** 口の名前（入力はパラメータ名） */
  readonly name: string;
  readonly type: string;
  /** 出力なら出力の位置、入力なら `inputs[]` の位置（パラメータでまだ項目が無ければ -1） */
  readonly slot: number;
  /** パラメータへ繋ぐとき。入力に変えてから繋ぐ（変数を落としたときと同じ） */
  readonly widget: { readonly name: string; readonly type: string } | null;
  /** 既に線が来ている入力（繋ぐと張り替わる） */
  readonly linked: boolean;
}

/** ノード参照の候補の絞り込み */
interface ReferenceOptions {
  /** 起点のノード。候補から外す */
  readonly exclude: NodeId;
  /** 型の絞り込み。空なら絞らない */
  readonly type: string;
  /** 何にでも繋がる口（`*`）も合うものとして数えるか */
  readonly anyType: boolean;
  /** ノード名・口の名前の部分一致（大小を区別しない） */
  readonly query: string;
}

function nodeLabelOf(view: NodeView): string {
  return view.comment.length > 0 ? view.comment : view.displayName;
}

/**
 * カードから、繋ぐ候補の口を並べる。入力から開いたら接続元の出力を、出力から開いたら接続先の
 * 入力（パラメータを含む、線を受けられる行）を並べ、起点のノード自身と壊れたノードは外す。
 */
export function referenceSlots(
  views: readonly NodeView[],
  side: ReferenceSide,
  { exclude, type, anyType, query }: ReferenceOptions,
): ReferenceSlot[] {
  const terms = searchTerms(query);
  const result: ReferenceSlot[] = [];

  for (const view of views) {
    if (view.id === exclude || view.broken !== undefined) continue;
    const nodeLabel = nodeLabelOf(view);
    const base = { nodeId: view.id, nodeIndex: view.index, nodeLabel };

    const slots: ReferenceSlot[] =
      side === 'outputs'
        ? view.outputs.map((output, slot) => ({
            ...base,
            key: `${String(view.id)}:out:${String(slot)}`,
            name: output.name,
            type: output.type,
            slot,
            widget: null,
            linked: false,
          }))
        : view.rows
            .filter((row) => row.linkable)
            .map((row) => ({
              ...base,
              key: `${String(view.id)}:in:${row.name}`,
              name: row.label,
              type: row.type,
              slot: row.inputSlot ?? -1,
              widget: row.kind === 'widget' ? { name: row.widgetName, type: row.type } : null,
              linked: row.kind === 'link',
            }));

    for (const slot of slots) {
      if (type !== '' && !slotTypeMatches(slot.type, type, anyType)) continue;
      if (!matchesAnyTerm([slot.nodeLabel, slot.name], terms)) continue;
      result.push(slot);
    }
  }
  return result;
}

/** ノード参照の左の一覧の 1 行（候補を持つノード） */
interface ReferenceNode {
  readonly nodeId: NodeId;
  readonly nodeIndex: string | null;
  readonly nodeLabel: string;
  /** そのノードの候補の数 */
  readonly count: number;
}

/** 左の一覧。候補のあるノードだけを、候補の並び（カードの並び）で */
export function referenceNodes(slots: readonly ReferenceSlot[]): ReferenceNode[] {
  const nodes = new Map<NodeId, ReferenceNode>();
  for (const slot of slots) {
    const found = nodes.get(slot.nodeId);
    nodes.set(slot.nodeId, {
      nodeId: slot.nodeId,
      nodeIndex: slot.nodeIndex,
      nodeLabel: slot.nodeLabel,
      count: (found?.count ?? 0) + 1,
    });
  }
  return [...nodes.values()];
}
