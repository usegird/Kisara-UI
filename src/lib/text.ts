// ─────────────────────────────
// 表示用の文字列整形（ComfyUI 非依存）。各コンポーネントで作り直さない（同名で挙動が違うものが
// 増えるため）。
// ─────────────────────────────

// 値 → 文字列の変換は**用途ごとに答えが違う**ので、3 本を並べて置く。
//
//   | 関数                 | 用途                     | null/未設定 | boolean | 空文字列 |
//   | -------------------- | ------------------------ | ----------- | ------- | -------- |
//   | `formatValue`        | 要約の並びに載せる       | `''`        | ON/OFF  | `''`     |
//   | `formatEditValue`    | 入力欄・option の素の値  | `''`        | `true`  | `''`     |
//   | `formatDisplayValue` | 読み取り表示のラベル     | `—`         | ON/OFF  | （空）   |
//
// `formatDisplayValue` は空文字列の表記が言語で変わるので `@/i18n/format` に置く。日時もそこ。

/** 1 つ上の単位へ上げるバイトの倍率 */
const BYTE_UNIT_STEP = 1024;
/** この値以上は小数を出さない（3 桁あれば足りる） */
const WHOLE_NUMBER_FROM = 100;

/** `truncate` の出し方 */
interface TruncateOptions {
  /** 空白の並びを 1 つに潰して前後を落とす（既定 true）。false なら改行も空白もそのまま残す */
  readonly singleLine?: boolean;
}

/** 長ければ末尾を「…」で省略する。既定では 1 行に潰してから測る */
export function truncate(text: string, max: number, options: TruncateOptions = {}): string {
  const source = (options.singleLine ?? true) ? text.replace(/\s+/g, ' ').trim() : text;
  return source.length > max ? `${source.slice(0, max)}…` : source;
}

/** 値を1行の表示用文字列にする。表示できない形は空文字にして呼び出し側で捨てさせる */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
  return '';
}

/** 入力欄・`<option>` に入れる素の文字列。**値をそのまま往復させる**ので記号を足さない */
export function formatEditValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** ファイルの大きさ。桁を落として読みやすさを優先する */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '';
  if (bytes < BYTE_UNIT_STEP) return `${String(bytes)} B`;

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / BYTE_UNIT_STEP;
  let unit = 0;
  while (value >= BYTE_UNIT_STEP && unit < units.length - 1) {
    value /= BYTE_UNIT_STEP;
    unit += 1;
  }
  return `${value.toFixed(value >= WHOLE_NUMBER_FROM ? 0 : 1)} ${units[unit] ?? 'KB'}`;
}
