export function pageOrigin(): string {
  return typeof globalThis.location === 'undefined' ? '' : globalThis.location.origin;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
