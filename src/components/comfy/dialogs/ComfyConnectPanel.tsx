import { cva } from 'class-variance-authority';

import { comfySecurityNotes } from '@/components/comfy/dialogs/security-notes';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HistoryCombobox } from '@/components/ui/history-combobox';
import { SecurityNotes } from '@/components/ui/security-notes';
import { useBaseUrlDraft } from '@/hooks/comfy/use-base-url-draft';
import { useComfyConnect } from '@/hooks/comfy/use-comfy-connection';
import { t } from '@/i18n';
import { pageOrigin } from '@/lib/host';
import { guardPress } from '@/lib/press-guard';
import { failureGuide, launchSample, type FailureGuide } from '@/queue/connection-guide';
import type { ConnectionStatus } from '@/queue/connection-status';
import { useComfyConnectDialogStore } from '@/store/use-comfy-connect-dialog-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTermsStore } from '@/store/use-terms-store';

// ─────────────────────────────
// 「ComfyUI に接続する」のポップアップの中身。起動と接続の 2 つの手順と、失敗の案内・注意を並べる。
// ─────────────────────────────

/** ページのオリジン。`--enable-cors-header` に渡す値になる */
/** 接続先の例。空の欄で Tab を押すとそのまま入る */
const URL_EXAMPLE = 'http://127.0.0.1:8188';

/**
 * 接続先の欄と接続のボタンを出し、失敗したら推定した原因の案内を出す。
 * ブラウザは CORS 拒否・Local Network Access 拒否・接続不能を区別できないため、推定した原因
 * （`diagnoseFailure`）ごとに次にやることが 1 つに決まる案内にし、「接続できません」で終わらせない。
 */
export function ComfyConnectPanel(): React.ReactElement {
  const [draft, setDraft] = useBaseUrlDraft();
  const history = useSettingsStore((state) => state.baseUrlHistory);
  const forgetBaseUrl = useSettingsStore((state) => state.forgetBaseUrl);

  const status = useConnectionStore((state) => state.status);
  const diagnosis = useConnectionStore((state) => state.diagnosis);

  const definitionsStatus = useDefinitionsStore((state) => state.status);
  const definitionCount = useDefinitionsStore((state) => state.definitions.size);

  // 操作だけ。起動時の自動接続は AppShell が 1 回だけ持つ（ここでも呼ぶと 2 回試す）
  const { connect, connected, busy } = useComfyConnect();

  // 私的なアドレスの外の接続先に初めてつなぐ前の、注意への合意。`connect` が頼む
  const remotePending = useComfyConnectDialogStore((state) => state.remotePending);

  const origin = pageOrigin();
  // 文に入れる接続先は、実際に失敗した要求の宛先（入力欄はその後で書き換えられる）
  const failure =
    diagnosis === null
      ? null
      : {
          guide: failureGuide(diagnosis.code, origin, diagnosis.status, diagnosis.targetUrl),
          targetUrl: diagnosis.targetUrl,
        };

  return (
    <section className="px-4 py-4">
      <ol className="space-y-5 text-sm">
        <LaunchStep origin={origin} />
        <li>
          <p className="font-medium">{t('comfy.connect.urlStep')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* つながった接続先の履歴から選べる。空の欄で Tab を押すと例が入る */}
            <HistoryCombobox
              className="min-w-72"
              value={draft}
              onValueChange={setDraft}
              items={history}
              label={t('comfy.connection.urlLabel')}
              placeholder={URL_EXAMPLE}
              example={URL_EXAMPLE}
              title={t('comfy.connect.urlTabHint')}
              onEnter={guardPress('comfy-connect', () => void connect(draft))}
              onRemove={forgetBaseUrl}
            />
            <ConnectButton
              // つながっている間だけ「再接続」。つながっていても押せる（`useComfyConnect`）
              again={connected}
              disabled={busy || status === 'connecting'}
              onConnect={guardPress('comfy-connect', () => void connect(draft))}
            />
            {/* 接続の状況は接続のボタンの右に出す（失敗の案内は下） */}
            {failure ? null : (
              <ConnectionNotice
                status={status}
                ready={definitionsStatus === 'ready'}
                count={definitionCount}
              />
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">{t('comfy.connect.permissionNote')}</p>
          {failure ? <FailureNotice guide={failure.guide} targetUrl={failure.targetUrl} /> : null}
        </li>
      </ol>
      <SecurityNotes notes={comfySecurityNotes()} />
      <ConfirmDialog
        open={remotePending !== null}
        title={t('comfy.connection.remoteTitle')}
        description={t('comfy.connection.remoteNotice')}
        confirmLabel={t('comfy.connection.remoteAgree')}
        cancelLabel={t('comfy.connection.remoteCancel')}
        onConfirm={() => {
          const url = remotePending ?? '';
          useComfyConnectDialogStore.getState().clearRemote();
          useTermsStore.getState().acceptComfyRemote();
          void connect(url);
        }}
        onCancel={() => useComfyConnectDialogStore.getState().clearRemote()}
      />
    </section>
  );
}

// ─────────────────────────────
// 手順 1・2：起動と接続、失敗の案内
// ─────────────────────────────

/** 手順 1。ComfyUI を起動するコマンドに起動オプションを足した形を、シェルの見本として見せる */
function LaunchStep({ origin }: { readonly origin: string }): React.ReactElement {
  const sample = launchSample(origin);
  return (
    <li>
      <p className="font-medium">{t('comfy.connect.launchStep')}</p>
      <p className="text-muted-foreground mt-1 text-xs">{t('comfy.connect.launchNote')}</p>
      <figure className="bg-muted mt-1 rounded text-xs">
        <figcaption className="text-muted-foreground border-border border-b px-2 py-1 font-mono">
          {sample.label}
        </figcaption>
        <code className="block px-2 py-1 font-mono break-all">{sample.command}</code>
      </figure>
      <p className="text-muted-foreground mt-1 text-xs">{t('comfy.connect.launchWhy')}</p>
    </li>
  );
}

function ConnectButton({
  again,
  disabled,
  onConnect,
}: {
  readonly again: boolean;
  readonly disabled: boolean;
  readonly onConnect: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      className="bg-primary text-primary-foreground rounded-md px-3 py-1
        disabled:opacity-50"
      disabled={disabled}
      onClick={onConnect}
      title={t(again ? 'comfy.connect.reconnectTitle' : 'comfy.connect.connectTitle')}
    >
      {t(again ? 'comfy.connect.reconnect' : 'comfy.connection.connect')}
    </button>
  );
}

// つながっている間は青い点と一言、つないでいる途中は薄い一行（失敗の案内と同じ場所）
const notice = cva('flex items-center gap-1.5 text-xs', {
  variants: { tone: { connected: '', connecting: 'text-muted-foreground' } },
});

/** 接続の状況。失敗の案内が無いときに接続のボタンの右へ出す。つないでいなければ何も出さない */
function ConnectionNotice({
  status,
  ready,
  count,
}: {
  readonly status: ConnectionStatus;
  readonly ready: boolean;
  readonly count: number;
}): React.ReactElement | null {
  if (status === 'connecting') {
    return (
      <p role="status" className={notice({ tone: 'connecting' })}>
        {t('comfy.connect.connecting')}
      </p>
    );
  }
  if (status !== 'connected') return null;
  return (
    <p role="status" className={notice({ tone: 'connected' })}>
      {/* 青はつながっている印（右の列の接続の状況と同じ色） */}
      <span aria-hidden className="bg-slot-image size-2 shrink-0 rounded-full" />
      {ready ? t('comfy.connect.connected', { count }) : t('comfy.connect.connectedPlain')}
    </p>
  );
}

function FailureNotice({
  guide,
  targetUrl,
}: {
  readonly guide: FailureGuide;
  readonly targetUrl: string;
}): React.ReactElement {
  return (
    <div
      role="alert"
      className="bg-destructive/10 text-destructive mt-3 rounded-md px-3 py-2 text-xs"
    >
      <p className="font-medium">{guide.summary}</p>
      {guide.steps.length === 1 ? (
        <p>{guide.steps[0]}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5">
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      )}
      {guide.summary.includes(targetUrl) ? null : (
        <p className="mt-1 opacity-80">{t('comfy.connect.target', { url: targetUrl })}</p>
      )}
    </div>
  );
}
