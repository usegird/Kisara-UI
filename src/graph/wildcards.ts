// ─────────────────────────────
// ワイルドカードの名前（接続先の Impact Pack は `__color/warm__` の形で返す）を階層と名前に読み分ける。
// 差し込むのは接続先が返した名前そのもの（ここで作り直さない）。
// ─────────────────────────────

/** 前後の `__` を除いた中身（`color/warm`）。付いていなければそのまま */
export function wildcardPath(name: string): string {
  return name.replace(/^__/u, '').replace(/__$/u, '');
}

/** 階層（`color`）。根の直下なら空文字 */
export function wildcardDirectory(name: string): string {
  const path = wildcardPath(name);
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

/** 一覧に出す名前（`warm`）。階層は左の絞り込みで分かるので省く */
export function wildcardLabel(name: string): string {
  const path = wildcardPath(name);
  return path.slice(path.lastIndexOf('/') + 1);
}
