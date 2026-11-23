import type { OutputFileRef } from '@/port/files';
import { imagesOf } from '@/queue/outputs';
import type { QueueTask } from '@/queue/queue-tasks';

export interface Slide {
  readonly key: string;
  readonly promptId: string;
  readonly number: number | null;
  readonly file: OutputFileRef;
  readonly until?: number | undefined;
}

export function slideKey(promptId: string, file: OutputFileRef): string {
  return `${promptId}:${file.type}:${file.subfolder}/${file.filename}`;
}

export type SlideFilter = 'all' | 'temp' | 'output';

export const SLIDE_FILTERS: readonly SlideFilter[] = ['all', 'temp', 'output'];

export function buildSlides(tasks: readonly QueueTask[], filter: SlideFilter = 'all'): Slide[] {
  const slides: Slide[] = [];

  for (const task of tasks) {
    for (const file of imagesOf(task.outputs)) {
      if (filter !== 'all' && file.type !== filter) continue;
      slides.push({
        key: slideKey(task.promptId, file),
        promptId: task.promptId,
        number: task.number,
        file,
        until: task.recordedEnd,
      });
    }
  }
  return slides;
}

export function slideIndex(slides: readonly Slide[], key: string | null): number {
  if (key === null) return -1;
  return slides.findIndex((slide) => slide.key === key);
}

export function promptIdOfKey(key: string | null): string | null {
  if (key === null) return null;

  const at = key.indexOf(':');
  return at < 0 ? null : key.slice(0, at);
}

export function resolveSlide(slides: readonly Slide[], key: string | null): string | null {
  if (key === null) return slides[0]?.key ?? null;
  if (slides.some((slide) => slide.key === key)) return key;

  return firstSlideOf(slides, promptIdOfKey(key));
}

export function firstSlideOf(slides: readonly Slide[], promptId: string | null): string | null {
  if (promptId === null) return null;
  return slides.find((slide) => slide.promptId === promptId)?.key ?? null;
}

export function pageStart(slides: readonly Slide[], key: string | null, perPage: number): number {
  const at = slideIndex(slides, key);
  if (at < 0) return 0;

  return Math.floor(at / Math.max(1, perPage)) * Math.max(1, perPage);
}

export function anchoredStart(
  slides: readonly Slide[],
  anchor: string | null,
  key: string | null,
  perPage: number,
): number {
  const size = Math.max(1, perPage);
  const at = slideIndex(slides, resolveSlide(slides, anchor));
  if (anchor === null || at < 0) return pageStart(slides, key, size);

  const here = slideIndex(slides, key);
  if (here >= 0 && (here < at || here >= at + size)) return pageStart(slides, key, size);
  return at;
}

export function moveAnchored(
  slides: readonly Slide[],
  start: number,
  perPage: number,
  direction: number,
): string | null {
  const size = Math.max(1, perPage);
  let next = start + direction * size;
  if (direction < 0 && next < 0 && start > 0) next = 0;
  if (next < 0 || next >= slides.length) return null;

  return slides[next]?.key ?? null;
}

export function pageNumbers(
  total: number,
  start: number,
  perPage: number,
): { readonly from: number; readonly to: number } {
  const end = Math.min(start + Math.max(1, perPage), total);

  return { from: total - end + 1, to: total - start };
}

export function shouldFollow(slides: readonly Slide[], previous: readonly Slide[]): boolean {
  const head = slides[0]?.key;
  return head !== undefined && !previous.some((slide) => slide.key === head);
}

export interface CellOffset {
  readonly x: number;
  readonly y: number;
}

export function followShift(
  previous: readonly Slide[],
  slides: readonly Slide[],
  perPage: number,
  start = 0,
): number {
  const lead = previous[0]?.key;
  const found = lead === undefined ? -1 : slides.findIndex((slide) => slide.key === lead);
  const at = found < 0 ? -1 : found - start;

  return at <= 0 ? Math.max(1, perPage) : Math.min(at, Math.max(1, perPage));
}

function cellOf(position: number, cols: number): CellOffset {
  return { x: position % cols, y: Math.floor(position / cols) };
}

export function pushInOffsets(shift: number, perPage: number, cols: number): CellOffset[] {
  const width = Math.max(1, cols);

  return Array.from({ length: perPage }, (_, j) => {
    const from = j - shift;
    if (from < 0) return { x: -shift, y: 0 };

    const a = cellOf(from, width);
    const b = cellOf(j, width);
    return { x: a.x - b.x, y: a.y - b.y };
  });
}

export function pushOutOffsets(shift: number, perPage: number): (CellOffset | null)[] {
  return Array.from({ length: perPage }, (_, q) =>
    q + shift < perPage ? null : { x: shift, y: 0 },
  );
}
