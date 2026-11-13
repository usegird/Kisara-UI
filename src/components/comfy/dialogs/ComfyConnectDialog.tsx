import { ComfyConnectPanel } from '@/components/comfy/dialogs/ComfyConnectPanel';
import { DialogFrame } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';

// ─────────────────────────────
// 「ComfyUI に接続する」のポップアップ。ComfyUI の画面の上に重ねる。開くか閉じるかはページ全体で持つ。
// ─────────────────────────────

/** 接続のポップアップの props */
export interface ComfyConnectDialogProps {
  /** 自動で出してよい画面か（画像のタブでは自動で出さない） */
  readonly auto: boolean;
  /**
   * ワークフローを開いていないタブか。起動時の自動接続を試した後は、つないでいてもいつも出して
   * 閉じさせず、焦点も閉じ込めない（帯のタブの切り替え・閉じる、ワークフローの一覧を使えるように）
   */
  readonly pinned: boolean;
}

/**
 * 頼まれたとき、または自動で出してよい画面でつないでいないと決まったときに、接続のポップアップを出す。
 * ワークフローを開いていないタブでは、つないでいても、閉じても（× や Esc）出し続ける。
 * 小さいダイアログと同じく × だけにし、埋め込みへの切り替えを持たない。
 */
export function ComfyConnectDialog({ auto, pinned }: ComfyConnectDialogProps): React.ReactElement {
  const requested = useComfyConnectDialogStore((state) => state.requested);
  const dismissed = useComfyConnectDialogStore((state) => state.dismissed);
  const autoTried = useComfyConnectDialogStore((state) => state.autoTried);
  const offline = useOffline();
  const kept = auto && pinned && autoTried;
  const open = requested || kept || (auto && offline && !dismissed);
  return (
    <DialogFrame
      id="comfy-connect"
      // 接続先の欄の右に接続のボタンが並ぶよう、小さいダイアログの 1.5 倍の幅にする。
      // 中の注意を開くと背が伸びるので、上寄せにして頭を動かさない
      size="smWideTop"
      modal={!kept}
      open={open}
      onOpenChange={(next) => {
        if (!next) useComfyConnectDialogStore.getState().close();
      }}
      title={t('comfy.connect.heading')}
    >
      {/* 小さいダイアログは高さを決めないので、上寄せの位置から画面に収まるよう中身の高さを抑えて送る */}
      <div className="max-h-[calc(100dvh-10rem)] overflow-y-auto">
        {open ? <ComfyConnectPanel /> : null}
      </div>
    </DialogFrame>
  );
}

/**
 * つないでいないと決まったか。起動時の自動接続を試した後で、未接続か失敗したとき。
 * つないでいる途中・つながっている・再接続のために未接続にしている間は false
 */
function useOffline(): boolean {
  const autoTried = useComfyConnectDialogStore((state) => state.autoTried);
  return useConnectionStore(
    (state) =>
      autoTried && !state.pausing && (state.status === 'disconnected' || state.status === 'failed'),
  );
}
