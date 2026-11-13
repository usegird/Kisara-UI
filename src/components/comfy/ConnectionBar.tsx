import { ConnectionStatus } from '@/components/comfy/queue/ConnectionStatus';
import { t } from '@/i18n';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 右の列の設定のタブの接続まわり。接続中の接続先と状況を出すだけにし、接続先はポップアップで変える。
// ─────────────────────────────

/** 接続中の接続先・「再接続」のボタン・接続の状況を並べる */
export function ConnectionBar(): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl.trim());
  return (
    <div className="flex max-w-(--control-max) flex-col gap-1">
      <p className="truncate px-1 font-mono" title={baseUrl || undefined}>
        {baseUrl.length > 0 ? baseUrl : t('comfy.bar.noUrl')}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="border-input shrink-0 rounded-md border px-2 py-1"
          title={t('comfy.bar.openConnectTitle')}
          onClick={() => useComfyConnectDialogStore.getState().open()}
        >
          {t('comfy.bar.reconnect')}
        </button>
        <span className="min-w-0">
          <ConnectionStatus compact />
        </span>
      </div>
    </div>
  );
}
