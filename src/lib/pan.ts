const PERCENT = 100;

export function panPercent(offset: number, size: number): string {
  const percent = Math.min(PERCENT, Math.max(0, (offset / Math.max(1, size)) * PERCENT));
  return `${percent.toFixed(1)}%`;
}

export function panTo(image: HTMLElement, offsetX: number, offsetY: number): void {
  image.style.setProperty('--pan-x', panPercent(offsetX, image.clientWidth));
  image.style.setProperty('--pan-y', panPercent(offsetY, image.clientHeight));
}

export function panReset(image: HTMLElement): void {
  image.style.removeProperty('--pan-x');
  image.style.removeProperty('--pan-y');
}
