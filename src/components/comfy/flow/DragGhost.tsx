import { useCallback } from 'react';

// ─────────────────────────────
// 並べ替えで指に付ける写し。掴んだときのカード（グループ）の要素を写したもの。
// ─────────────────────────────

/** 指に付ける写しの受け取り物 */
export interface DragGhostProps {
  /** 掴んだときの要素の写し（useFlowDnd が作る） */
  readonly node: HTMLElement;
  /**
   * カードの列の倍率。写しは列の外に出るので、同じ倍率を掛け直す
   */
  readonly zoom: number;
}

/**
 * 写した要素をそのまま差し込んで出す。カードを 2 枚描くと位置の台帳に同じ鍵が 2 つ載り、
 * 線の行き先が揺れるので、描き直さずに写しを使う
 */
export function DragGhost({ node, zoom }: DragGhostProps): React.ReactElement {
  // ref のコールバック。作り直すと付け外しが起きるので、compiler に任せず手で固定する
  const attachGhost = useCallback(
    (element: HTMLDivElement | null) => {
      element?.replaceChildren(node);
    },
    [node],
  );

  return (
    // 写しは `li` なので、外では行頭の印が出ないよう打ち消す
    <div
      ref={attachGhost}
      aria-hidden
      className="pointer-events-none list-none opacity-90 drop-shadow-lg"
      style={{ zoom }}
    />
  );
}
