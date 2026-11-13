import {
  autoSlot,
  needsChoice,
  slotChoices,
  type ConnectSide,
  type SlotChoice,
} from '@/graph/connect-choice';
import type { ReferenceSlot } from '@/graph/node-reference';
import type { PlacementAnchor } from '@/graph/order';
import type { NodeRow } from '@/graph/rows';
import type { LinkId, NodeDefinition, NodeId } from '@/graph/types';
import { useNodePlacement } from '@/hooks/flow/use-node-placement';
import { useRowEditing } from '@/hooks/flow/use-row-editing';
import { useTabState } from '@/hooks/flow/use-tab-state';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// カード上の編集操作。書き込み先は `row.target` が持つので、ノード名で分岐せず target の種類だけで振り分ける。
// ─────────────────────────────

/**
 * ノード追加の起点。**どのスロットから呼ばれたか**まで持つ。
 *   ・`after` : 出力チップの ▼ と変数の左の ▶。その出力の先へ足す（既存の線は変えない）
 *   ・`before`: パラメータの ▶。その入力の手前へ挿し込む
 *   ・`between`: 線の真ん中の ⊕。その線（同じ出力から出る線なら何本でも）の間に挟む
 *   ・`append`: 列の末尾の「ノードを追加」。**起点が無い**ので繋がず足すだけ
 *
 * `slotType` は起点のスロット型。検索の絞り込みの初期値に使う
 * （先へ足すなら**その型を受けられる**ノード、手前へ足すなら**出せる**ノード）。
 */
export type SearchMode =
  | {
      readonly kind: 'after';
      readonly nodeId: NodeId;
      readonly slot: number;
      readonly slotType: string;
    }
  | {
      readonly kind: 'before';
      readonly nodeId: NodeId;
      /** `inputs[]` の位置。パラメータ行で項目がまだ無ければ null */
      readonly slot: number | null;
      /** パラメータ行から足すときの widget 名（繋ぐときに入力へ変える） */
      readonly widget: string | null;
      readonly slotType: string;
    }
  | {
      readonly kind: 'between';
      /** 挟む線。2 本以上なら同じ出力から出ている（点線の ⊕） */
      readonly linkIds: readonly LinkId[];
      /** 線の型。入力・出力の両方の絞り込みの初期値 */
      readonly slotType: string;
    }
  | {
      readonly kind: 'append';
      /**
       * 置く場所。無ければ末尾。カードの間の ⊕ から開いたときは、下のカードの手前。
       * どちらも起点の口が無いので繋がない
       */
      readonly anchor?: PlacementAnchor | undefined;
    };

/**
 * 繋ぎ先の問い合わせ。**型で決まらないときだけ**出す
 * （合う口が無い / 2 つ以上あって選べない）。
 */
export interface ConnectChoice {
  readonly definition: NodeDefinition;
  readonly side: ConnectSide;
  /** 起点のスロットの型。どれが合うかの目印に使う */
  readonly type: string;
  readonly choices: readonly SlotChoice[];
}

/** カード上の編集の状態（開いている検索・設定・問い合わせ）と手続き */
export interface NodeEditing {
  readonly search: SearchMode | null;
  readonly setSearch: (mode: SearchMode | null) => void;
  readonly settingsFor: NodeId | null;
  readonly setSettingsFor: (nodeId: NodeId | null) => void;
  /** パラメータ1つの値を書き戻す */
  readonly commitValue: (row: NodeRow, value: unknown) => void;
  /** 複数行の入力の高さを、ノードの `size` へ書き戻す */
  readonly resizeText: (row: NodeRow, height: number) => void;
  /**
   * COMBO の選択肢を必要になった時点で取りに行く。
   */
  readonly needOptions: (row: NodeRow) => void;
  /** 検索で選ばれた定義を、起点のスロットに応じて挿す */
  readonly pickDefinition: (definition: NodeDefinition) => void;
  /**
   * ノード参照で選んだ口へ繋ぐ。入力から開いたなら選んだ出力から、
   * 出力から開いたなら選んだ入力へ。変数をパラメータ行へ落としたときと同じ扱い
   */
  readonly pickReference: (slot: ReferenceSlot) => void;
  /** 繋ぎ先の問い合わせ。null なら出していない */
  readonly connectChoice: ConnectChoice | null;
  /** 問い合わせへの答え。null なら繋がずに足す */
  readonly resolveConnect: (slot: number | null) => void;
}

/** パラメータの書き戻し・ノードの追加と挿し込み・ノード参照の接続を行う手続きを返す */
export function useNodeEditing(): NodeEditing {
  const connect = useGraphStore((state) => state.connect);
  const connectToWidget = useGraphStore((state) => state.connectToWidget);
  const { commitValue, resizeText, needOptions } = useRowEditing();
  const place = useNodePlacement();

  // 開いているダイアログと対象はタブごとに持つ
  const [search, setSearch] = useTabState<SearchMode | null>('flow.search', null);
  const [settingsFor, setSettingsFor] = useTabState<NodeId | null>('flow.settingsFor', null);
  const [pending, setPending] = useTabState<(ConnectChoice & { readonly mode: SearchMode }) | null>(
    'flow.connect',
    null,
  );

  const pickDefinition = (definition: NodeDefinition): void => {
    if (search === null) return;

    if (search.kind === 'append' || search.kind === 'between') {
      place(definition, search, null);
      setSearch(null);
      return;
    }

    const side: ConnectSide = search.kind === 'after' ? 'input' : 'output';
    const choices = slotChoices(definition, search.slotType, side);

    // **どこに繋ぐか決まらないときは尋ねる**（黙って先頭に繋がない）
    if (needsChoice(choices)) {
      setPending({ definition, mode: search, side, type: search.slotType, choices });
      setSearch(null);
      return;
    }

    place(definition, search, autoSlot(choices));
    setSearch(null);
  };

  const resolveConnect = (slot: number | null): void => {
    if (pending === null) return;

    place(pending.definition, pending.mode, slot);
    setPending(null);
  };

  const pickReference = (slot: ReferenceSlot): void => {
    const mode = search;
    setSearch(null);
    if (mode === null || mode.kind === 'append' || mode.kind === 'between') return;

    if (mode.kind === 'before') {
      // 選んだ出力 → 起点の入力。パラメータで項目がまだ無ければ入力に変えてから繋ぐ
      if (mode.slot !== null) connect(slot.nodeId, slot.slot, mode.nodeId, mode.slot);
      else if (mode.widget !== null) {
        connectToWidget(slot.nodeId, slot.slot, mode.nodeId, {
          name: mode.widget,
          type: mode.slotType,
        });
      }
      return;
    }

    // 起点の出力 → 選んだ入力（パラメータなら入力に変えてから）
    if (slot.widget !== null) connectToWidget(mode.nodeId, mode.slot, slot.nodeId, slot.widget);
    else connect(mode.nodeId, mode.slot, slot.nodeId, slot.slot);
  };

  return {
    search,
    setSearch,
    pickReference,
    settingsFor,
    setSettingsFor,
    commitValue,
    resizeText,
    needOptions,
    pickDefinition,
    connectChoice: pending,
    resolveConnect,
  };
}
