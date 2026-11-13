import { createContext } from 'react';

import type { NodeId } from '@/graph/types';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';

// ─────────────────────────────
// 座標レジストリの受け渡し。カード・行・変数ボックスが同じ仕組みに登録する。
// キーの組み立てもここに集約し、登録側と描画側でずれないようにする。
// ─────────────────────────────

/** 座標レジストリを列の中の部品へ渡す文脈 */
export const AnchorContext = createContext<AnchorRegistry | null>(null);

/** 変数パネル本体。スクロールに追従する上端位置を測るのに使う */
export const PANEL_ANCHOR_KEY = 'panel';

/** フロー全体のスクロール領域。カードの出力欄が「画面に出たか」の判定に使う */
export const VIEWPORT_ANCHOR_KEY = 'viewport';

/** 全体を横に送る枠。結果画像などを重ねる範囲を見えている所に収めるのに使う */
export const FLOW_VIEWPORT_ANCHOR_KEY = 'flowviewport';

/** アプリ入力の列のスクロール領域。線の始点を見えている範囲に寄せるのに使う */
export const APP_VIEWPORT_ANCHOR_KEY = 'appviewport';

/** アプリ入力の枠（カードの形のまとまり）。右の枠線がカードの行へ引く線の始点の横位置 */
export function appCardAnchorKey(groupKey: string): string {
  return `appcard:${groupKey}`;
}

/** アプリ入力の入力欄。カードの行へ引く線の始点の高さ */
export function appSourceAnchorKey(nodeId: NodeId, widgetName: string): string {
  return `appsrc:${nodeId}:${widgetName}`;
}

/** カード側の、アプリ入力にした行。線の終点（行の左端＝カードの枠線） */
export function appTargetAnchorKey(nodeId: NodeId, widgetName: string): string {
  return `appdst:${nodeId}:${widgetName}`;
}

/** アプリ入力の枠の格子。12 分割の 1 つ分が何 px かを出すのに使う */
export function appGridAnchorKey(groupKey: string): string {
  return `appgrid:${groupKey}`;
}

/** カード本体。変数グループを下揃えする基準に使う */
export function cardAnchorKey(nodeId: NodeId): string {
  return `card:${nodeId}`;
}

/**
 * グループの枠（タブを含む）。変数の列のタブからカードの列を送る先に使う
 */
export function groupAnchorKey(groupKey: string): string {
  return `group:${groupKey}`;
}

/** カードのパラメタ部分（入力行・パラメータ行のまとまり）。直結してよいかの判定に使う */
export function bodyAnchorKey(nodeId: NodeId): string {
  return `body:${nodeId}`;
}

/** カード右下の出力アンカー（実際のスロット数に関わらず1点） */
export function outputAnchorKey(nodeId: NodeId): string {
  return `out:${nodeId}`;
}

/** 出力チップ（スロットごと）。掴んでいる間の線の引き元（チップの下端の中央） */
export function outputChipAnchorKey(nodeId: NodeId, slot: number): string {
  return `outchip:${nodeId}:${slot}`;
}

/** 接続済み入力行 */
export function inputAnchorKey(nodeId: NodeId, inputName: string): string {
  return `in:${nodeId}:${inputName}`;
}

/** 変数ボックス */
export function variableAnchorKey(variableKey: string): string {
  return `var:${variableKey}`;
}
