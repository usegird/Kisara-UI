// ─────────────────────────────
// 一覧の中で重ならない名前。重なれば後ろに 2・3… を付ける（一覧を名前で引く欄で、選び分けられるように）
// ─────────────────────────────

/** `base` が `taken` に無ければそのまま、あれば「base 2」「base 3」…の最初の空き */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
}
