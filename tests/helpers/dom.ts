import { vi } from 'vitest';

// ─────────────────────────────
// jsdom に無い DOM の仕組みの代わり（cmdk・測定フックが呼ぶ）。
// 中身は何もしない。レイアウトを持たない jsdom で、呼んでも落ちないようにするだけ。
// ─────────────────────────────

export function stubMissingDom(): void {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

/**
 * メディアクエリの答えを決め打ちにする（jsdom には幅も入力の種類も無い）。
 * `query` と同じ問い合わせにだけ `matches` を返し、ほかは偽。狭い画面・指での操作の確認に使う
 */
export function stubMediaQuery(query: string, matches: boolean): void {
  vi.stubGlobal('matchMedia', (asked: string) => ({
    matches: matches && asked === query,
    media: asked,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
