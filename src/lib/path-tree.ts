// ─────────────────────────────
// `/` で区切った経路から、階層の一覧（入れ子の深さと件数つき）を作る（ComfyUI 非依存）。
// モデルを選ぶ画面のディレクトリと、ワイルドカードの階層で同じものを使う。
// ─────────────────────────────

/** 階層の一覧の 1 行 */
export interface PathDirectory {
  /** 根からの経路。根なら空文字 */
  readonly path: string;
  /** この階層だけの名前 */
  readonly label: string;
  /** 入れ子の深さ（根は 0） */
  readonly depth: number;
  /** 直下と、その下すべてを合わせた件数 */
  readonly count: number;
}

/**
 * 項目ごとの置き場（空文字は根の直下）から、階層の一覧を作る。並びは経路の順
 * （親の直後に子が来る）
 */
export function directoryTree(directories: readonly string[]): PathDirectory[] {
  const counts = new Map<string, number>();

  for (const directory of directories) {
    if (directory.length === 0) continue;

    const segments = directory.split('/');
    for (let end = 1; end <= segments.length; end += 1) {
      const path = segments.slice(0, end).join('/');
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }

  return [...counts.keys()].sort().map((path) => ({
    path,
    label: path.split('/').pop() ?? path,
    depth: path.split('/').length - 1,
    count: counts.get(path) ?? 0,
  }));
}

/** 経路を、最後の `/` より前（置き場。無ければ空文字）と後ろ（名前）に分ける */
export function splitPath(path: string): { readonly directory: string; readonly label: string } {
  const at = path.lastIndexOf('/');
  return at < 0
    ? { directory: '', label: path }
    : { directory: path.slice(0, at), label: path.slice(at + 1) };
}

/** 置き場が、選んだ階層（入れ子を含む）の下か。空文字を選んでいれば全部 */
export function isUnderDirectory(directory: string, selected: string): boolean {
  return selected.length === 0 || directory === selected || directory.startsWith(`${selected}/`);
}
