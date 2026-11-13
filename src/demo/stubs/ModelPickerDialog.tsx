import type { ModelPickerDialogProps } from '@/components/comfy/flow/dialogs/model-picker-props';

// ─────────────────────────────
// デモのビルドでモデルの選択の画面の代わりに入る。モデルの一覧は接続先から取るので、
// 通信しないデモでは選択の画面が開かない（欄は選択肢のまま出る）。
// ─────────────────────────────

export type { ModelPickerDialogProps };

/** モデルの選択の画面の代わり。万一呼ばれても欄だけを出す */
export function ModelPickerDialog({ trigger }: ModelPickerDialogProps): React.ReactElement {
  return <>{trigger}</>;
}
