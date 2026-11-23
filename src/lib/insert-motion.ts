import { caretRectOf, createTextMirror } from '@/lib/caret-rect';
import { prefersReducedMotion } from '@/lib/host';
import { insertEntry, type TextField } from '@/lib/insert-at-caret';
import { truncate } from '@/lib/text';

const CHIP_MAX = 40;

const CHIP_CLASS =
  'bg-popover text-popover-foreground fixed top-0 left-0 z-[60] rounded border px-1.5 py-0.5 ' +
  'font-mono text-xs whitespace-nowrap shadow pointer-events-none';

const FLIGHT_MS = 250;

const OPEN_MS = 200;

const CHAR_MS = 15;

const MAX_TYPE_MS = 250;

const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

export interface InsertMotion {
  readonly start: number;
  readonly text: string;
  readonly origin: DOMRect | null;
}

export function createTextChip(doc: Document, text: string): HTMLDivElement {
  const chip = doc.createElement('div');
  chip.textContent = truncate(text, CHIP_MAX, { singleLine: false });
  chip.className = CHIP_CLASS;
  return chip;
}

export function playInsertMotion(field: HTMLTextAreaElement, motion: InsertMotion): void {
  if (prefersReducedMotion() || typeof field.animate !== 'function') return;
  const to = caretRectOf(field, motion.start);
  const delay = motion.origin === null ? 0 : FLIGHT_MS;
  if (motion.origin !== null) flyChip(field.ownerDocument, motion.text, motion.origin, to);
  revealInserted(field, motion, delay);
}

export function placeEntry(field: TextField, text: string, origin: DOMRect | null): boolean {
  const placed = insertEntry(field, text);
  if (placed === null) return false;
  if (field instanceof HTMLTextAreaElement) playInsertMotion(field, { ...placed, origin });
  return true;
}

function flyChip(
  doc: Document,
  text: string,
  origin: DOMRect,
  to: { readonly left: number; readonly top: number },
): void {
  const chip = createTextChip(doc, text);
  doc.body.append(chip);
  const fromX = origin.left + origin.width / 2 - chip.offsetWidth / 2;
  const fromY = origin.top + origin.height / 2 - chip.offsetHeight / 2;
  const animation = chip.animate(
    [
      { transform: `translate(${String(fromX)}px, ${String(fromY)}px)`, opacity: 1 },
      { transform: `translate(${String(to.left)}px, ${String(to.top)}px)`, opacity: 0.6 },
    ],
    { duration: FLIGHT_MS, easing: EASING, fill: 'forwards' },
  );
  void animation.finished.catch(() => undefined).finally(() => chip.remove());
}

function revealInserted(field: HTMLTextAreaElement, motion: InsertMotion, delay: number): void {
  const doc = field.ownerDocument;
  const mirror = createTextMirror(field);
  const { value } = field;
  const end = motion.start + motion.text.length;
  const typing = createTyping(doc, value.slice(motion.start, end));
  const pushes = motion.text.endsWith('\n');
  const after = doc.createElement(pushes ? 'div' : 'span');
  after.textContent = value.slice(end);
  mirror.append(value.slice(0, motion.start), typing.element, after);
  Object.assign(mirror.style, {
    height: `${String(field.offsetHeight)}px`,
    pointerEvents: 'none',
    zIndex: '40',
    background: 'transparent',
  });
  doc.body.append(mirror);
  mirror.scrollTop = field.scrollTop;
  const opened = pushes
    ? after.getBoundingClientRect().top - typing.element.getBoundingClientRect().top
    : 0;
  const shown = doc.defaultView?.getComputedStyle(field).color ?? '';
  const { color, caretColor } = field.style;
  mirror.style.color = shown;
  field.style.caretColor = shown;
  field.style.color = 'transparent';

  const finish = (): void => {
    field.removeEventListener('input', finish);
    field.removeEventListener('scroll', finish);
    if (!mirror.isConnected) return;
    mirror.remove();
    field.style.color = color;
    field.style.caretColor = caretColor;
  };
  field.addEventListener('input', finish);
  field.addEventListener('scroll', finish);
  const shift = `translateY(${String(-Math.max(opened, 0))}px)`;
  const animation = after.animate([{ transform: shift }, { transform: 'translateY(0)' }], {
    duration: OPEN_MS,
    delay,
    easing: EASING,
    fill: 'backwards',
  });
  void animation.finished
    .catch(() => undefined)
    .finally(() => {
      if (mirror.isConnected) typing.play(doc.defaultView, finish);
      else finish();
    });
}

interface Typing {
  readonly element: HTMLSpanElement;
  readonly play: (view: (Window & typeof globalThis) | null, done: () => void) => void;
}

function createTyping(doc: Document, text: string): Typing {
  const element = doc.createElement('span');
  const typed = doc.createElement('span');
  const rest = doc.createElement('span');
  rest.style.color = 'transparent';
  rest.textContent = text;
  element.append(typed, rest);
  const show = (count: number): void => {
    typed.textContent = text.slice(0, count);
    rest.textContent = text.slice(count);
  };
  return {
    element,
    play: (view, done) => {
      const characters = text.length;
      const total = Math.min(characters * CHAR_MS, MAX_TYPE_MS);
      if (view === null || typeof view.requestAnimationFrame !== 'function' || total === 0) {
        show(characters);
        done();
        return;
      }
      const startedAt = view.performance.now();
      const step = (now: number): void => {
        if (!element.isConnected) return;
        const count = Math.min(Math.ceil(((now - startedAt) / total) * characters), characters);
        show(count);
        if (count < characters) view.requestAnimationFrame(step);
        else done();
      };
      view.requestAnimationFrame(step);
    },
  };
}
