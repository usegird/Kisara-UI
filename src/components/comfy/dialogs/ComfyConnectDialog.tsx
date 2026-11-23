import { ComfyConnectPanel } from '@/components/comfy/dialogs/ComfyConnectPanel';
import { DialogFrame } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';

export interface ComfyConnectDialogProps {
  readonly auto: boolean;
  readonly pinned: boolean;
  readonly covered: boolean;
}

export function ComfyConnectDialog({
  auto,
  pinned,
  covered,
}: ComfyConnectDialogProps): React.ReactElement {
  const requested = useComfyConnectDialogStore((state) => state.requested);
  const dismissed = useComfyConnectDialogStore((state) => state.dismissed);
  const autoTried = useComfyConnectDialogStore((state) => state.autoTried);
  const offline = useOffline();
  const kept = auto && pinned && autoTried;
  const open = !covered && (requested || kept || (auto && offline && !dismissed));
  return (
    <DialogFrame
      id="comfy-connect"
      size="smWideTop"
      modal={!kept}
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
