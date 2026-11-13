import { LlmSetupPanel } from '@/components/llm/dialogs/LlmConnectPanel';
import { DialogFrame } from '@/components/ui/dialog';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 「LLM に接続する」のダイアログ。選んだ接続の設定とモデルは全体の設定に入れる（どの会話にも効く）。
// 開くか閉じるかは呼び出し側が持つ。
// ─────────────────────────────

/** 「LLM に接続する」のダイアログの props */
export interface LlmConnectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** 会話の画面の上に重ねる、接続の案内のダイアログ */
export function LlmConnectDialog({ open, onClose }: LlmConnectDialogProps): React.ReactElement {
  const initial = useLlmTarget();
  return (
    <DialogFrame
      id="llm-connect"
      // 小さいダイアログと同じく × だけ（埋め込みへの切り替えを持たない）
      // 入力欄の右に接続のボタンが並ぶよう、小さいダイアログの 1.5 倍の幅にする
      size="smWide"
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('llm.onboarding.title')}
    >
      {/* 小さいダイアログは高さを決めないので、画面に収まるよう中身の高さを抑えて送る */}
      <div className="max-h-[80vh] overflow-y-auto">
        {/* 開くたびに全体の選んでいるものから始めたいので、中身は開いている間だけ置く */}
        {open ? (
          <LlmSetupPanel
            inDialog
            initial={initial}
            onStart={(target) => {
              useSettingsStore.getState().setLlmTarget(target);
              onClose();
            }}
          />
        ) : null}
      </div>
    </DialogFrame>
  );
}
