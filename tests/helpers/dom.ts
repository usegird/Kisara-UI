import { vi } from 'vitest';

export function stubMissingDom(): void {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

export function stubMediaQuery(query: string, matches: boolean): void {
  vi.stubGlobal('matchMedia', (asked: string) => ({
    matches: matches && asked === query,
    media: asked,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
