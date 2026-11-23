import { ComfyConnectPanel } from '@/components/comfy/dialogs/ComfyConnectPanel';
import { DialogFrame } from '@/components/ui/dialog';
import { useNarrowerThan } from '@/hooks/ui/use-narrow-screen';
import { t } from '@/i18n';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore } from '@/store/use-settings-store';

const DIALOG_MAX_WIDTH = 576;

export interface ComfyConnectDialogProps {
  readonly auto: boolean;
  readonly pinned: boolean;
  readonly covered: boolean;
  readonly listShown: boolean;
}

export function ComfyConnectDialog({
  auto,
  pinned,
  covered,
  listShown,
}: ComfyConnectDialogProps): React.ReactElement {
  const requested = useComfyConnectDialogStore((state) => state.requested);
  const dismissed = useComfyConnectDialogStore((state) => state.dismissed);
  const offline = useOffline();
  const listWidth = useSettingsStore((state) => state.chatSidebarWidth);
  const overlapsList = useNarrowerThan(listShown ? DIALOG_MAX_WIDTH + listWidth * 2 : 0);
  const open = !covered && !overlapsList && (requested || (auto && offline && !dismissed));
  return (
    <DialogFrame
      id="comfy-connect"
      size="smWideTop"
      modal={!pinned}
      open={open}
      onOpenChange={(next) => {
        if (!next) useComfyConnectDialogStore.getState().close();
      }}
      title={t('comfy.connect.heading')}
    >
      <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto">
        {open ? <ComfyConnectPanel /> : null}
      </div>
    </DialogFrame>
  );
}

function useOffline(): boolean {
  const autoTried = useComfyConnectDialogStore((state) => state.autoTried);
  return useConnectionStore(
    (state) =>
      autoTried && !state.pausing && (state.status === 'disconnected' || state.status === 'failed'),
  );
}
