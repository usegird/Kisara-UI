import { LlmSetupPanel } from '@/components/llm/dialogs/LlmConnectPanel';
import { DialogFrame } from '@/components/ui/dialog';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

export interface LlmConnectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

export function LlmConnectDialog({ open, onClose }: LlmConnectDialogProps): React.ReactElement {
  const initial = useLlmTarget();
  return (
    <DialogFrame
      id="llm-connect"
      size="smWide"
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('llm.onboarding.title')}
    >
      <div className="max-h-[80vh] overflow-y-auto">
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
