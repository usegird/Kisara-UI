// ─────────────────────────────
// ページを読み込み直す。呼ぶ所を 1 つにして、テストで差し替えられるようにする
// （`location` は差し替えのできない環境がある。vitest の vmForks では定義し直せない）
// ─────────────────────────────

/** ページを読み込み直す */
export function reloadPage(): void {
  globalThis.location.reload();
}
