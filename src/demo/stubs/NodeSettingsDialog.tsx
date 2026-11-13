import type { NodeSettingsDialogProps } from '@/components/comfy/flow/dialogs/NodeSettingsDialog';

// ─────────────────────────────
// デモのビルドで詳細設定の代わりに入る。デモは詳細設定を開かない
// ─────────────────────────────

export type { NodeSettingsDialogProps };

/** 詳細設定の代わり。何も描かない */
export function NodeSettingsDialog(_props: NodeSettingsDialogProps): null {
  return null;
}
