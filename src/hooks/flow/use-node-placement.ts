import type { ConnectSide } from '@/graph/connect-choice';
import { incomingLinkTo } from '@/graph/links';
import { modelInputNames } from '@/graph/model-files';
import type { LinkId, NodeDefinition } from '@/graph/types';
import type { SearchMode } from '@/hooks/flow/use-node-editing';
import { useGraphStore } from '@/store/use-graph-store';
import { modelIndexes, useModelFilesStore } from '@/store/use-model-files-store';

// ─────────────────────────────
// 検索で選んだノードを、起点のスロットに応じて置く。
// ─────────────────────────────

/** 起点と繋ぎ先が決まったノードを置く手続きを返す。`newSlot` が null なら繋がない */
export function useNodePlacement(): (
  definition: NodeDefinition,
  mode: SearchMode,
  newSlot: number | null,
) => void {
  const workflow = useGraphStore((state) => state.workflow);
  const addNode = useGraphStore((state) => state.addNode);
  const insertNodeAt = useGraphStore((state) => state.insertNodeAt);

  /**
   * 間に挿し込むリンク（A→N→B）。**入力から足したときだけ**で、その入力に来ている線を使う。
   * 出力から足したときは既存の線を変えず、新しいノードへの線を 1 本足す
   */
  const linkFor = (mode: SearchMode): LinkId | null => {
    if (!workflow || mode.kind !== 'before' || mode.slot === null) return null;
    return incomingLinkTo(workflow, mode.nodeId, mode.slot);
  };

  const place = (definition: NodeDefinition, mode: SearchMode, newSlot: number | null): void => {
    // 置いたときに空にしておく入力。モデルを選ぶ選択肢は先頭のファイルを勝手に選ばない。
    // 判定はモデルの一覧が取れているときだけ効く。押した時点の一覧を読む
    const blank = modelInputNames(definition, modelIndexes(useModelFilesStore.getState().folders));
    // 起点の口が無ければ繋がずに足す（末尾か、カードの間の ⊕ ならその位置）
    if (mode.kind === 'append') {
      addNode(definition, mode.anchor, undefined, blank);
      return;
    }
    // 線の ⊕: その線の間に挟む。口は型で決め、入力元の次に置く
    if (mode.kind === 'between') {
      insertNodeAt(mode.linkIds, definition, { blank });
      return;
    }

    const link = linkFor(mode);
    const side: ConnectSide = mode.kind === 'after' ? 'input' : 'output';

    if (link !== null) {
      // 間に挟む。選んでもらった口があれば、起点に面した側だけ差し替える
      const slots =
        newSlot === null ? {} : side === 'input' ? { inputSlot: newSlot } : { outputSlot: newSlot };
      // 出力から足したら起点の次、入力から足したら起点の前に置く
      insertNodeAt([link], definition, {
        slots,
        anchor: { nodeId: mode.nodeId, side: mode.kind },
        blank,
      });
      return;
    }

    // リンクが無い（末端から足す）ときは、隣に置いた上で**呼び出し元のスロットへ繋ぐ**
    addNode(
      definition,
      { nodeId: mode.nodeId, side: mode.kind },
      {
        kind: mode.kind,
        nodeId: mode.nodeId,
        slot: mode.slot,
        type: mode.slotType,
        ...(mode.kind === 'before' && mode.widget !== null ? { widget: mode.widget } : {}),
        ...(newSlot === null ? {} : { newSlot }),
      },
      blank,
    );
  };

  return place;
}
