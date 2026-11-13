import { isRecord } from '@/lib/guards';
import { setOwn } from '@/lib/own-key';

// ─────────────────────────────
// 文字列のハッシュ（cyrb53。53 ビットを 16 進 14 文字で返す）。
// 暗号用ではない。中身が同じかを見分ける鍵にだけ使う。
// ─────────────────────────────

// cyrb53 の種・掛ける数・ずらす幅（アルゴリズムが決める値）
const SEED_HIGH = 0xdeadbeef;
const SEED_LOW = 0x41c6ce57;
const MIX_HIGH = 2654435761;
const MIX_LOW = 1597334677;
const AVALANCHE_FIRST = 2246822507;
const AVALANCHE_SECOND = 3266489909;
const SHIFT_FIRST = 16;
const SHIFT_SECOND = 13;
/** 2 の 32 乗（上位の 21 ビットを 32 ビット上へ送る） */
const UINT32_RANGE = 4294967296;
/** 上位の 21 ビットを残す印（21 + 32 = 53 ビット） */
const HIGH_21_BITS = 2097151;
const HEX_RADIX = 16;
/** 53 ビットを 16 進で書いた桁数 */
const HASH_HEX_DIGITS = 14;

/** 文字列の 53 ビットのハッシュを 16 進 14 文字で返す。同期で求めたいので `crypto.subtle` は使わない */
export function hash53(text: string): string {
  let h1 = SEED_HIGH;
  let h2 = SEED_LOW;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    h1 = Math.imul(h1 ^ code, MIX_HIGH);
    h2 = Math.imul(h2 ^ code, MIX_LOW);
  }
  h1 = Math.imul(h1 ^ (h1 >>> SHIFT_FIRST), AVALANCHE_FIRST);
  h1 ^= Math.imul(h2 ^ (h2 >>> SHIFT_SECOND), AVALANCHE_SECOND);
  h2 = Math.imul(h2 ^ (h2 >>> SHIFT_FIRST), AVALANCHE_FIRST);
  h2 ^= Math.imul(h1 ^ (h1 >>> SHIFT_SECOND), AVALANCHE_SECOND);

  const value = UINT32_RANGE * (HIGH_21_BITS & h2) + (h1 >>> 0);
  return value.toString(HEX_RADIX).padStart(HASH_HEX_DIGITS, '0');
}

/** キーを並べ替えた JSON。キーの順が違うだけのものを同じ文字列にする */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!isRecord(value)) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) setOwn(sorted, key, sortKeys(value[key]));
  return sorted;
}
