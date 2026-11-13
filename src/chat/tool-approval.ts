// ─────────────────────────────
// 呼び出しを確認なしに実行してよいかの判断（承諾の関門）。判断はここだけに置き、既定は確認を待つ。
// ─────────────────────────────

/**
 * 呼び出しの種類。確認を省けるかは種類で決まる
 */
type ToolCallKind = 'workflow';

/** 確認を省けるかの判断に使う、呼び出しと画面の状態 */
export interface ToolApprovalInput {
  readonly kind: ToolCallKind;
  /** 設定「Workflow実行確認をバイパスする」 */
  readonly skipConfirm: boolean;
  /** この画面で受け取ったか（読み込み直して開いた会話の呼び出しは勝手に実行しない） */
  readonly fresh: boolean;
  /** ComfyUI に接続しているか（つないでいなければ、つないでから人が押す） */
  readonly connected: boolean;
}

/** 確認を出さずに実行してよいか */
export function runsWithoutConfirm(input: ToolApprovalInput): boolean {
  return input.kind === 'workflow' && input.skipConfirm && input.fresh && input.connected;
}
