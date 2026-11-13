import { createContext } from 'react';

// ─────────────────────────────
// ワークフローの画面の見た目の切り替え。本体は既定のまま使い、デモだけが変える（`compact` は狭い画面の本体も使う）。
// 列の中のどの深さの部品からも読めるよう、引数ではなく文脈で渡す
// ─────────────────────────────

/** ワークフローの画面の見た目の切り替えの組 */
export interface FlowLook {
  /**
   * アプリ入力の項目に、カードの値の取り込みを出す
   */
  readonly appImport: boolean;
  /** アプリ入力の枠の ×（アプリ入力から外す） */
  readonly appRemove: boolean;
  /** カードのコメントを名前の下の 2 行目に出す */
  readonly commentBelow: boolean;
  /** 出力チップを縦に並べ、線をチップごとに出す（既定は右下の点 1 つから） */
  readonly chipOutputs: boolean;
  /** カード・App の枠・グループの枠・変数のまとまりの内側の余白を倍にする */
  readonly roomy: boolean;
  /** カードの行の左と、名前と入力の間を詰める（狭い画面。`roomy` より優先） */
  readonly compact: boolean;
}

const DEFAULT_FLOW_LOOK: FlowLook = {
  appImport: true,
  appRemove: true,
  commentBelow: false,
  chipOutputs: false,
  roomy: false,
  compact: false,
};

export const FlowLookContext = createContext<FlowLook>(DEFAULT_FLOW_LOOK);
