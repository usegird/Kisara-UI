import type { OutputFileRef } from '@/port/files';
import { imagesOf } from '@/queue/outputs';
import type { QueueTask } from '@/queue/queue-tasks';

// ─────────────────────────────
// ビューワーで送る 1 枚ずつの並びと、ページ送り・追従の計算。画像はすべて対等に並べる。
// ─────────────────────────────

/** ビューワーで送る画像 1 枚 */
export interface Slide {
  /** 送りの位置を指す鍵。タスクとファイルの組で一意 */
  readonly key: string;
  readonly promptId: string;
  /** キュー番号。取れなければ null */
  readonly number: number | null;
  readonly file: OutputFileRef;
  /** 実行の記録の画像なら、その実行の完了時刻（接続先の時計）。これより後に書かれたファイルは出さない */
  readonly until?: number | undefined;
}

/** 画像 1 枚の鍵（`promptId:type:subfolder/filename`） */
export function slideKey(promptId: string, file: OutputFileRef): string {
  return `${promptId}:${file.type}:${file.subfolder}/${file.filename}`;
}

/** ビューワーで出す画像の種別。`all` はすべて、ほかは出力の `type` がそれと同じものだけ */
export type SlideFilter = 'all' | 'temp' | 'output';

/** 選べる種別の並び */
export const SLIDE_FILTERS: readonly SlideFilter[] = ['all', 'temp', 'output'];

/**
 * 画像を持つタスクの画像を並べる。`filter` を渡すとその種別だけにする（プレビューと保存の両方を
 * 持つワークフローは、同じ画像を 2 つの種別で出すため）
 */
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

/** 今見ている位置。見つからなければ -1 */
export function slideIndex(slides: readonly Slide[], key: string | null): number {
  if (key === null) return -1;
  return slides.findIndex((slide) => slide.key === key);
}

/** 鍵からタスクの id を取り出す（鍵は `promptId:type:subfolder/filename`） */
export function promptIdOfKey(key: string | null): string | null {
  if (key === null) return null;

  const at = key.indexOf(':');
  return at < 0 ? null : key.slice(0, at);
}

/**
 * 見ている位置を、今ある並びに合わせ直す。
 *
 * **実行中の一時画像は、終わると別のファイルに差し替わる**ので、
 * 見ていた鍵が並びから消える。そのまま先頭へ落とすと、追従を切っていても
 * 新しい画像へ飛んでしまうため、**同じタスクの先頭**へ寄せる。
 */
export function resolveSlide(slides: readonly Slide[], key: string | null): string | null {
  if (key === null) return slides[0]?.key ?? null;
  if (slides.some((slide) => slide.key === key)) return key;

  return firstSlideOf(slides, promptIdOfKey(key));
}

/** そのタスクの最初の 1 枚。無ければ null */
export function firstSlideOf(slides: readonly Slide[], promptId: string | null): string | null {
  if (promptId === null) return null;
  return slides.find((slide) => slide.promptId === promptId)?.key ?? null;
}

/**
 * 一度に出す枚数で区切った、今のページの先頭の位置。
 * 並びの先頭から区切る。錨（出しているページの先頭）が無いときの区切りに使う（`anchoredStart`）。
 */
export function pageStart(slides: readonly Slide[], key: string | null, perPage: number): number {
  const at = slideIndex(slides, key);
  if (at < 0) return 0;

  return Math.floor(at / Math.max(1, perPage)) * Math.max(1, perPage);
}

/**
 * 追従を切っているときのページの先頭の位置。
 * **錨（出していたページの先頭の画像）から数える**ので、新しい画像が先頭に増えても
 * 出している並びは変わらない（勝手に並べ直さない）。錨が無い・見つからないとき、
 * 見ている画像が錨のページの外にあるとき（1 枚で見ていて送った後など）は、先頭から数えた区切りに戻す
 */
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

/**
 * 錨から数えたページを 1 つ送った先の鍵（追従を切っているとき）。`direction` は `-1` が新しい方。
 * 新しい方の端に足りないときは先頭まで送る（間を飛ばさない）。送れないときは null
 */
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

/**
 * 今のページに出ている分の通し番号。**古いものが 1**。
 * 並びは新しい順なので、末尾ほど小さい番号になる。
 */
export function pageNumbers(
  total: number,
  start: number,
  perPage: number,
): { readonly from: number; readonly to: number } {
  const end = Math.min(start + Math.max(1, perPage), total);

  // 先頭（＝いちばん新しい）が total、末尾（＝いちばん古い）が 1
  return { from: total - end + 1, to: total - start };
}

/**
 * 新しい画像が出たときに送るかどうか（追従が入っているとき）。
 * **先頭が新しい画像に替わったら、どのページを見ていても先頭へ送る**。
 * 遡って見たいときは追従を切る。
 * **前の並びに居た画像が先頭に来ただけ**（先頭の画像が一時的に抜けた）なら送らない
 * （送ると古い方へ戻ってしまう）
 */
export function shouldFollow(slides: readonly Slide[], previous: readonly Slide[]): boolean {
  const head = slides[0]?.key;
  return head !== undefined && !previous.some((slide) => slide.key === head);
}

// ─────────────────────────────
// 追従の押しのけ。新しい画像が先頭に入り、出ていた画像が増えた枚数だけ後ろの枠へ繰り下がる。
// 動きの量は枠の数で返し、描く側が枠の大きさを掛ける。
// ─────────────────────────────

/** 枠の数で数えたずれ。右・下が正 */
export interface CellOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * 前に出ていた並びの先頭が、新しい並びの `start` から何枚後ろへ下がったか（＝増えた枚数）。
 * 見つからなければ（入れ替わりすぎた）1 ページ分とみなす
 */
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

/**
 * 入ってくる側の枠ごとの出どころ。枠 `j` の画像は前の枠 `j - shift` から来る。
 * 新しく入った画像（前に居なかった）は、同じ行のまま左の外から入る
 */
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

/**
 * 出ていく側の枠ごとの行き先。枠からあふれる画像だけを動かし、
 * 残る画像（入ってくる側が描く）は null。あふれた画像は同じ行のまま右の外へ出す
 */
export function pushOutOffsets(shift: number, perPage: number): (CellOffset | null)[] {
  return Array.from({ length: perPage }, (_, q) =>
    q + shift < perPage ? null : { x: shift, y: 0 },
  );
}
