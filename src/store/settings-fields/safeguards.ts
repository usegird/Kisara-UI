import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// 防御機構の値。繰り返し実行と LLM の要求の量の歯止めが使う上限を 1 か所にまとめる。
// 画面では変えられない（設定のタブに出すだけ）。壊れた値は既定に落とす。
// ─────────────────────────────

/** 歯止めの上限の組 */
export interface Safeguards {
  /** 繰り返し実行で、失敗がこの回数続いたら繰り返しを終える */
  readonly repeatFailureLimit: number;
  /** 繰り返し実行で、前に投げてから次を投げるまでの最短の間隔（ms） */
  readonly repeatMinIntervalMs: number;
  /** 繰り返し実行で、1 回の繰り返しが投げる回数の上限 */
  readonly repeatMaxRuns: number;
  /** LLM の 1 回の要求で送る中身の上限（トークンの見積もり。補正なし） */
  readonly llmRequestInputMax: number;
  /** LLM の要求の量を数える窓（分） */
  readonly llmWindowMinutes: number;
  /** 窓の間の出力の閾値（トークン。人が読める量は 1 分に約 600） */
  readonly llmWindowOutputLimit: number;
  /** 窓の間の入力の閾値（トークン。続きのたびに履歴を送り直す暴走を捉える） */
  readonly llmWindowInputLimit: number;
  /** LLM の受け取りで、中身が届かないまま待つ上限（分。注釈の行だけでは数え直さない） */
  readonly llmSilentMinutes: number;
  /** 確認を省いた Workflow の呼び出しを、1 回の返事で実行する数の上限（残りは承諾を待つ） */
  readonly toolAutoRunMax: number;
}

export const DEFAULT_SAFEGUARDS: Safeguards = {
  repeatFailureLimit: 5,
  repeatMinIntervalMs: 1000,
  repeatMaxRuns: 1000,
  llmRequestInputMax: 524_288,
  llmWindowMinutes: 30,
  llmWindowOutputLimit: 90_000,
  llmWindowInputLimit: 1_000_000,
  llmSilentMinutes: 5,
  toolAutoRunMax: 5,
};

/** 並べる順（設定のタブの行の順） */
export const SAFEGUARD_KEYS = Object.keys(DEFAULT_SAFEGUARDS) as readonly (keyof Safeguards)[];

/** 保存値を読む。正の有限の数でない項目は既定にする */
export function normalizeSafeguards(raw: unknown): Safeguards {
  const saved = isRecord(raw) ? raw : {};
  const pick = (key: keyof Safeguards): number => {
    const value = saved[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : DEFAULT_SAFEGUARDS[key];
  };
  const result: { -readonly [K in keyof Safeguards]: number } = { ...DEFAULT_SAFEGUARDS };
  for (const key of SAFEGUARD_KEYS) result[key] = pick(key);
  return result;
}

/**
 * 端末に残す分（既定と違う項目だけ）。無ければ undefined（何も残さない）。
 * 画面からは変えられないので、ふつうは何も残らず、既定を変えればそのまま効く。残っている値
 * （利用者が保存値を書き換えたもの）は読んで使う（公式には認めないが、改造の余地として残す）
 */
export function safeguardOverrides(safeguards: Safeguards): Partial<Safeguards> | undefined {
  const changed = SAFEGUARD_KEYS.filter((key) => safeguards[key] !== DEFAULT_SAFEGUARDS[key]);
  if (changed.length === 0) return undefined;
  return Object.fromEntries(changed.map((key) => [key, safeguards[key]]));
}
