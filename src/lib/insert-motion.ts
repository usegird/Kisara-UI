import { caretRectOf, createTextMirror } from '@/lib/caret-rect';
import { prefersReducedMotion } from '@/lib/host';
import { insertEntry, type TextField } from '@/lib/insert-at-caret';
import { truncate } from '@/lib/text';

// ─────────────────────────────
// 入れた文字の動き。札を押した所から入れた位置まで飛ばし、着いたら入った文字を幅 0 から広げる。
// 札はドラッグで指先に付いてくるものと同じ見た目にする（ここが唯一の作り手）。
// ─────────────────────────────

/** 札に出す文字の上限（長い文面は末尾を省く） */
const CHIP_MAX = 40;

/** 札の見た目（ドラッグの札と確定の動きで同じ） */
const CHIP_CLASS =
  'bg-popover text-popover-foreground fixed top-0 left-0 z-[60] rounded border px-1.5 py-0.5 ' +
  'font-mono text-xs whitespace-nowrap shadow pointer-events-none';

/** 札が飛ぶ長さ（ms） */
const FLIGHT_MS = 250;

/** 後ろの文字を押し下げて場所を空ける長さ（ms） */
const OPEN_MS = 200;

/** 空いた場所へ 1 文字を打つ間（ms） */
const CHAR_MS = 30;

/** 打ち終えるまでの上限（ms。長い文面でも待たせない） */
const MAX_TYPE_MS = 500;

/** 動きの緩み（着く・広がるときに減速する） */
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** 入れたときの動きに渡すもの */
export interface InsertMotion {
  /** 入れた文字の先頭の位置（入れる前のキャレット） */
  readonly start: number;
  /** 入れた文字。改行で終わること（後ろの文字は行の頭から始まる前提で組む） */
  readonly text: string;
  /** 札が飛び立つ所（押したカード）。無ければ飛ばさず、文字だけ広げる */
  readonly origin: DOMRect | null;
}

/**
 * 文字のドラッグや確定の動きで見せる札を作る（文書には足さない）
 */
export function createTextChip(doc: Document, text: string): HTMLDivElement {
  const chip = doc.createElement('div');
  chip.textContent = truncate(text, CHIP_MAX, { singleLine: false });
  chip.className = CHIP_CLASS;
  return chip;
}

/**
 * 入れた直後に呼ぶ。札を飛ばし、着いたら入った文字を広げる。動きを減らす設定や、動きの仕組みが無い環境
 * （テスト）では何もしない
 */
export function playInsertMotion(field: HTMLTextAreaElement, motion: InsertMotion): void {
  if (prefersReducedMotion() || typeof field.animate !== 'function') return;
  // 入れた位置より前の文字は変わらないので、入れた後に測っても入れた先頭の位置になる
  const to = caretRectOf(field, motion.start);
  const delay = motion.origin === null ? 0 : FLIGHT_MS;
  if (motion.origin !== null) flyChip(field.ownerDocument, motion.text, motion.origin, to);
  revealInserted(field, motion, delay);
}

/**
 * 差し込みの画面から 1 件を入れ（`insertEntry`）、入れた動きを見せる。`origin` は札が飛び立つ所
 * （無ければ文字が広がるだけ）。入れられたら true
 */
export function placeEntry(field: TextField, text: string, origin: DOMRect | null): boolean {
  const placed = insertEntry(field, text);
  if (placed === null) return false;
  if (field instanceof HTMLTextAreaElement) playInsertMotion(field, { ...placed, origin });
  return true;
}

/** 札を飛び立つ所の真ん中から、入れた位置の左上へ動かして消す */
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

/**
 * 欄に同じ字の組み方の写しを重ね、その間だけ欄の文字を隠す。写しの中で後ろの文字を押し下げて場所を
 * 空け、空いた場所へ入った文字を先頭から打つように出す。打つ・欄を送ったら写しをすぐ外す（写しが古くなる）
 */
function revealInserted(field: HTMLTextAreaElement, motion: InsertMotion, delay: number): void {
  const doc = field.ownerDocument;
  const mirror = createTextMirror(field);
  const { value } = field;
  const end = motion.start + motion.text.length;
  const typing = createTyping(doc, value.slice(motion.start, end));
  // 入れた文字は改行で終わるので、後ろの文字は必ず行の頭から始まる。塊にしても組み方は変わらず、
  // 塊ごと縦に動かせる
  const after = doc.createElement('div');
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
  // 入った文字が占める高さ（後ろの文字を押し下げる量）。入れる前は入った文字のすぐ下にあった
  const opened = after.getBoundingClientRect().top - typing.element.getBoundingClientRect().top;
  // 欄の文字だけを隠す。キャレットは欄の文字の色に従うので、元の色を当てて見せたままにする
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
      // 外したあと（打った・送った）は打たない
      if (mirror.isConnected) typing.play(doc.defaultView, finish);
      else finish();
    });
}

/** 打つように出す文字。打った分だけ色を付け、残りは透明にして場所を取り続ける（組み方を変えない） */
interface Typing {
  readonly element: HTMLSpanElement;
  /** 先頭から打ち、打ち終えたら `done` を呼ぶ。打つ仕組みが無い環境ではすぐ全部出す */
  readonly play: (view: (Window & typeof globalThis) | null, done: () => void) => void;
}

/** 入った文字を、打った分と残りの 2 つに分けて持つ塊を作る（最初は全部が残り） */
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
      // 打ち終えるか、写しが外れたら止める（時間とともに一方向にしか進まない）
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
