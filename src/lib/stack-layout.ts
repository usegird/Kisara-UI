// ─────────────────────────────
// 変数ボックスの縦位置。**常に隙間なく詰めて並べる**（カードとの対応は、パネル自身を
// 全体スクロールに連動させることで保つ）。
// ─────────────────────────────

/** 詰めて並べる 1 つの高さと、前後に空ける量 */
interface PackItem {
  readonly key: string;
  readonly height: number;
  /** 上に空ける量（グループの帯の先頭: タブと余白のぶん）。無ければ 0 */
  readonly before?: number | undefined;
  /** 下に空ける量（グループの帯の末尾: 余白のぶん）。無ければ 0 */
  readonly after?: number | undefined;
}

/** 並べ方の指定。`gap` は並べる物どうしの間隔 */
interface PackOptions {
  readonly gap: number;
}

/** 与えられた順に、隙間なく上から詰める。`before` / `after` は間隔に足して空ける */
export function packList(items: readonly PackItem[], options: PackOptions): Map<string, number> {
  const positions = new Map<string, number>();

  let cursor = 0;
  for (const item of items) {
    cursor += item.before ?? 0;
    positions.set(item.key, cursor);
    cursor += item.height + (item.after ?? 0) + options.gap;
  }
  return positions;
}
