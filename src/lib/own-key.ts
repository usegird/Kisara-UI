// ─────────────────────────────
// 外から来た鍵で物に書く。`target[key] = value` は鍵が `__proto__` だと、項目を作らずに物の親を差し替える
// （値が落ち、ほかの鍵の読み方も変わる）。ここでは `JSON.parse` と同じく自分の項目として書く。
// 飛ばさないのは、読んだデータを往復させても落とさないため（ワークフローの JSON を素の ComfyUI へ戻す）。
// ─────────────────────────────

/** 合わせた鍵の区切り。名前・URL に現れない文字 */
const KEY_SEPARATOR = '\u0000';

/** 鍵がどんな名前でも、自分の項目として書く */
export function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * 自分の項目があればそれを、無ければ作って書いてから返す（`target[key] ??= make()` の代わり）。
 * `??=` は鍵が `__proto__` だと親（`Object.prototype`）を返し、続けて書くと全体の親を汚す
 */
export function ownOr<T>(target: Record<string, T>, key: string, make: () => T): T {
  if (Object.hasOwn(target, key)) return target[key] as T;
  const value = make();
  setOwn(target, key, value);
  return value;
}

/** 1 つの鍵を外した写し。元の物は変えない */
export function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

/** 幾つかの値を合わせた 1 つの鍵（画面の中の表の鍵。端末には書かない） */
export function compositeKey(...parts: readonly string[]): string {
  return parts.join(KEY_SEPARATOR);
}
