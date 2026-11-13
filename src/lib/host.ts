// ─────────────────────────────
// ページの置かれた状況（ページの出どころ・動きを減らす設定）。宛先が私的かは remote-host が見る。
// ─────────────────────────────

/** このページの出どころ（`https://example.com` の形）。ページの外（テスト・Worker）では空 */
export function pageOrigin(): string {
  return typeof globalThis.location === 'undefined' ? '' : globalThis.location.origin;
}

/** 端末が動きを減らす設定か */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
