import { safeString } from '@/lib/trace';

// ─────────────────────────────
// 想定外の失敗を知らせる。**閉じ込めた失敗も握り潰さない**。
// ─────────────────────────────

/**
 * 想定外の失敗を、どこで起きたかを添えて知らせる。
 * 下の層（graph / comfy）は React やストアを知らないので、ブラウザ標準の `reportError` に渡す。
 * 画面側は window の error を聞いて帯に出す（store/use-fault-store）。
 * `reportError` が無い環境ではコンソールに出すだけにする。
 */
export function reportFault(where: string | FaultPlace, error: unknown): void {
  const wrapped =
    typeof where === 'string'
      ? new Error(`${where}: ${messageOf(error)}`, { cause: error })
      : new PlacedFault(where, error);

  const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
  if (typeof report === 'function') {
    report(wrapped);
    return;
  }
  console.error(wrapped);
}

/**
 * どこで起きたかの符号。文言の表を読まない層（通信の層）が使い、文は画面の側が符号から引く
 */
export interface FaultPlace {
  readonly code: string;
  readonly params: Readonly<Record<string, string>>;
}

/** 場所を符号で持つ失敗の知らせ。`message` は記録のための文で、画面には符号から引いた文を出す */
export class PlacedFault extends Error {
  readonly place: FaultPlace;

  constructor(place: FaultPlace, cause: unknown) {
    super(`${place.code}: ${messageOf(cause)}`, { cause });
    this.name = 'PlacedFault';
    this.place = place;
  }
}

/** 投げられた値を Error にそろえる（`toString` が投げる値でも、ここでは落ちない） */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(safeString(value));
}

/** 投げられた値から、出せる文言を取り出す */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
