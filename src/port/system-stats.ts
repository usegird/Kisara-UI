// ─────────────────────────────
// 接続先の版と実行環境の型（`GET /system_stats` の決めた欄だけ）。読めない欄は null。
// ─────────────────────────────

/** 接続先の 1 つの計算装置 */
interface SystemDevice {
  /** `cuda`・`cpu`・`mps` など */
  readonly type: string | null;
  readonly name: string | null;
  /** VRAM の総量（バイト） */
  readonly vramTotal: number | null;
}

/** 接続先の版と実行環境。起動オプション（`argv`）とメモリの空きは持たない */
export interface SystemStats {
  readonly comfyuiVersion: string | null;
  readonly pythonVersion: string | null;
  readonly pytorchVersion: string | null;
  readonly os: string | null;
  readonly devices: readonly SystemDevice[];
}
