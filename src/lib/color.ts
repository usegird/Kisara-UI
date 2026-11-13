// ─────────────────────────────
// 色の文字列の整形。ブラウザ標準の色選び（`<input type="color">`）は `#rrggbb` しか受けない。
// ─────────────────────────────

/** `#rrggbb` の赤・緑・青の始まりの位置 */
const CHANNEL_STARTS = { red: 1, green: 3, blue: 5 } as const;
const HEX_RADIX = 16;
const MAX_CHANNEL = 255;
/** 塗る色として受ける文字列の長さの上限（色の関数形も収まる長さ） */
const MAX_COLOR_LENGTH = 64;

/** `#rgb` / `#rrggbb` を `#rrggbb`（小文字）にする。それ以外の書き方は null */
export function toHexColor(value: string): string | null {
  // 3 桁は各桁を 2 回ずつ並べる（#322 → #332222）
  const full = /^#[0-9a-f]{3}$/i.test(value)
    ? `#${[...value.slice(1)].map((digit) => digit + digit).join('')}`
    : value;
  return /^#[0-9a-f]{6}$/i.test(full) ? full.toLowerCase() : null;
}

/** `#rrggbb` の各色を `factor` 倍する（1 未満で暗くなる）。読めない書き方は null */
export function scaleHexColor(value: string, factor: number): string | null {
  const hex = toHexColor(value);
  if (hex === null) return null;

  const channels = Object.values(CHANNEL_STARTS).map((at) => {
    const scaled = Math.round(Number.parseInt(hex.slice(at, at + 2), HEX_RADIX) * factor);
    return Math.min(MAX_CHANNEL, Math.max(0, scaled)).toString(HEX_RADIX).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

/**
 * 画面に塗ってよい色の文字列か。**ワークフローから来た値**なので形を確かめる
 * （`#rgb` / `#rrggbb` / 色の名前 / `rgb()` などの関数形。それ以外は塗らない）
 */
export function paintableColor(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  if (value.length > MAX_COLOR_LENGTH) return null;
  return /^[#a-z0-9(),.%\s-]+$/i.test(value) ? value : null;
}
