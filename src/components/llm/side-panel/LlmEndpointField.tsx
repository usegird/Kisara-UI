import { cva } from 'class-variance-authority';
import { useEffect, useRef, useState } from 'react';

import { profileForConnect, sameBaseUrl } from '@/chat/connection-profile';
import { formatLlmFailure } from '@/components/llm/message/failure-text';
import { useCloudConsent, type CloudConsent } from '@/components/llm/side-panel/use-cloud-consent';
import { HistoryCombobox } from '@/components/ui/history-combobox';
import { t, type MessageKey } from '@/i18n';
import type { LlmKeyEntryResult } from '@/port/llm-port';
import { llmKeyPort } from '@/store/ports/llm-key-port';
import { hasLlmKey, hasLlmKeyNow, isKeyMissing, useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// LLM のベース URL の欄と接続（再接続）のボタンと、API キーの入力の窓を開くボタン。
// キーはこの画面では受けず、ゲートウェイの入力の窓で入れる（本体はキーを持たない）。
// ─────────────────────────────

// 失敗は失敗の色の枠、つながっている間は青い点と一言（枠で囲まない）、つないでいる途中は薄い一行
const notice = cva('text-xs', {
  variants: {
    tone: {
      failed:
        'border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2',
      connected: 'flex items-center gap-1.5',
      connecting: 'text-muted-foreground',
    },
  },
});

/** 空の欄で Tab を押すと入る例（Ollama の OpenAI 互換の経路） */
const URL_EXAMPLE = 'http://127.0.0.1:11434/v1';

/** 窓を開けなかった理由ごとの文言（つながっていないのにポップアップの許可を求めない） */
const ENTRY_FAILURE_MESSAGE = {
  unready: 'llm.connection.entryUnready',
  blocked: 'llm.connection.entryBlocked',
} as const satisfies Record<Exclude<LlmKeyEntryResult, 'opened'>, MessageKey>;

/** ベース URL の欄と API キーを入れるボタンの props */
export interface LlmEndpointFieldProps {
  readonly profileId: string | null;
  /** 使う接続の設定を替える（作ったときも） */
  readonly onProfile: (profileId: string) => void;
  /** 欄の幅（文字の大きさを含む） */
  readonly className?: string | undefined;
  /** 薄い字の例と、空の欄で Tab を押したときに入る値。既定は Ollama のベース URL */
  readonly example?: string | undefined;
  /** 接続のボタンの右に置くもの（会話の右の列の接続の状況） */
  readonly status?: React.ReactNode;
  /** 接続のボタン（再接続を含む）でつながったとき。取ったモデルの一覧を渡す */
  readonly onConnected?: ((models: readonly string[]) => void) | undefined;
}

/**
 * ベース URL の欄と接続のボタンと、API キーを入れるボタン。打った値は送るまで接続の設定に書かず、
 * 送ったら同じ URL の設定を選び（無ければ作って選び）、モデルの一覧を取る
 */
export function LlmEndpointField({
  profileId,
  onProfile,
  className,
  example = URL_EXAMPLE,
  status,
  onConnected,
}: LlmEndpointFieldProps): React.ReactElement {
  const profiles = useLlmProfilesStore((state) => state.profiles);
  const profile = profiles.find((item) => item.id === profileId);
  const check = useLlmProfilesStore((state) =>
    profileId === null ? undefined : state.checks[profileId],
  );
  // 打ちかけの値はこの欄だけが持つ（呼び出し側は選んでいる設定を変えたら作り直す）
  const [draft, setDraft] = useState(profile?.baseUrl ?? '');
  const form = useRef<HTMLFormElement>(null);

  // 選んでいる設定に、ページを開いてから 1 回だけ自動でつなぐ（ComfyUI と同じ）
  useEffect(() => {
    if (profileId !== null) useLlmProfilesStore.getState().autoCheck(profileId);
  }, [profileId]);
  // 履歴はつながったベース URL だけ（最後につないだものが先頭）
  const urls = useSettingsStore((state) => state.llmUrlHistory);

  // 私的なアドレスの外に初めて送る前の、注意への合意の確認（接続とキーの入力の窓の両方）
  const consent = useCloudConsent();

  const connect = (): void => {
    const url = draft.trim();
    if (url.length === 0) return;
    consent.confirmFor(url, () => connectTo(url));
  };

  const connectTo = (url: string): void => {
    const store = useLlmProfilesStore.getState();
    // 同じ URL の設定、無ければ URL を持たない選んでいる設定、それも無ければ新しく作る
    const id = profileForConnect(store.profiles, url, profile)?.id ?? store.add();
    // キーはゲートウェイが持つ。キーを入れたかだけを残し、次に開いたときに自動でつながず案内を出す
    store.update(id, { baseUrl: url, keyRequired: hasLlmKeyNow(url) });
    if (id !== profileId) onProfile(id);
    const connected = id;
    void store.check(connected).then(() => {
      const result = useLlmProfilesStore.getState().checks[connected];
      if (result?.kind === 'ok') onConnected?.(result.models);
    });
  };

  // つながっている間だけ「再接続」（ComfyUI と同じ）。欄の URL がつないだ設定のものであること
  const connected =
    check?.kind === 'ok' && profile !== undefined && sameBaseUrl(profile.baseUrl, draft);

  return (
    // Enter で接続する。画面は移さない
    <form
      ref={form}
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        connect();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <HistoryCombobox
          className={className}
          value={draft}
          onValueChange={setDraft}
          items={urls}
          label={t('llm.connection.baseUrl')}
          placeholder={example}
          example={example}
          title={t('llm.connection.baseUrlHint')}
          // 一覧が Enter を受けるので、フォームを送り直す
          onEnter={() => form.current?.requestSubmit()}
          // 履歴から消すと、その URL の接続の設定も消す（選んでいる設定は残す）
          onRemove={(url) => {
            useSettingsStore.getState().forgetLlmUrl(url);
            useLlmProfilesStore.getState().forgetUrl(url, profileId);
          }}
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1 disabled:opacity-50"
          disabled={draft.trim().length === 0 || check?.kind === 'checking'}
        >
          {t(connected ? 'llm.connection.reconnect' : 'llm.connection.connect')}
        </button>
        {status}
      </div>
      <KeyEntry baseUrl={draft} confirmFor={consent.confirmFor} />
      {consent.dialog}
    </form>
  );
}

/**
 * 接続の状況。接続のボタンの右に置く（`status`）。失敗は出さない（API キーの下の `LlmConnectionFailure`）
 */
export function LlmConnectionNotice({
  profileId,
}: {
  readonly profileId: string | null;
}): React.ReactElement | null {
  const check = useLlmProfilesStore((state) =>
    profileId === null ? undefined : state.checks[profileId],
  );
  const profile = useLlmProfilesStore((state) =>
    state.profiles.find((item) => item.id === profileId),
  );
  // OpenRouter などはキー無しでもモデルの一覧を返すので、つながって見えても送ると断られる
  const keyless = useLlmKeysStore(
    (state) => profile !== undefined && isKeyMissing(profile, state.keyed, false),
  );
  if (check === undefined || check.kind === 'failed') return null;
  if (check.kind === 'checking') {
    return (
      <p role="status" className={notice({ tone: 'connecting' })}>
        {t('llm.connection.connecting')}
      </p>
    );
  }
  return (
    <p role="status" className={notice({ tone: 'connected' })}>
      {/* 青はつながっている印（ComfyUI の接続の状況と同じ色） */}
      <span aria-hidden className="bg-slot-image size-2 shrink-0 rounded-full" />
      {check.models.length > 0
        ? t('llm.connection.connected', { count: check.models.length })
        : t('llm.connection.noModels')}
      {keyless ? <span className="text-destructive">{t('llm.connection.noKey')}</span> : null}
    </p>
  );
}

/**
 * API キーの下に置くもの。ブラウザがローカルネットワークへのアクセスの許可を求めたときの案内と、
 * その下に接続の失敗の原因
 */
export function LlmConnectionFailure({
  profileId,
}: {
  readonly profileId: string | null;
}): React.ReactElement {
  const check = useLlmProfilesStore((state) =>
    profileId === null ? undefined : state.checks[profileId],
  );
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">{t('llm.connection.permissionNote')}</p>
      {check?.kind === 'failed' ? (
        <p role="alert" className={notice({ tone: 'failed' })}>
          {formatLlmFailure(check.failure)}
        </p>
      ) : null}
    </div>
  );
}

/** 接続の失敗の原因だけ（右の列の設定のタブ。失敗していなければ何も出さない） */
export function LlmConnectionError({
  profileId,
}: {
  readonly profileId: string | null;
}): React.ReactElement | null {
  const check = useLlmProfilesStore((state) =>
    profileId === null ? undefined : state.checks[profileId],
  );
  if (check?.kind !== 'failed') return null;
  return (
    <p role="alert" className={notice({ tone: 'failed' })}>
      {formatLlmFailure(check.failure)}
    </p>
  );
}

/**
 * API キーの入力の窓を開くボタンと、キーの状況。窓を開けなかったときはその旨を出す。
 * キーそのものは出さない（本体は持たない）
 */
function KeyEntry({
  baseUrl,
  confirmFor,
}: {
  readonly baseUrl: string;
  /** 外部クラウド接続の注意に合意してから続ける（キーを入れると確かめに送るため） */
  readonly confirmFor: CloudConsent['confirmFor'];
}): React.ReactElement {
  const keyed = useLlmKeysStore((state) => hasLlmKey(state.keyed, baseUrl));
  // そのキーでつながった（OpenRouter はキーの確かめも通った）ら、キーが通ると分かっている
  const connected = useLlmProfilesStore((state) =>
    state.profiles.some(
      (profile) => sameBaseUrl(profile.baseUrl, baseUrl) && state.checks[profile.id]?.kind === 'ok',
    ),
  );
  // 窓を開けた結果は、このボタンだけの状態
  const [entry, setEntry] = useState<LlmKeyEntryResult>('opened');
  const onEnterClick = (): void => {
    // ポップアップは利用者の操作の中でしか開けないので、押した手続き（合意を押した手続き）の中で開く
    confirmFor(baseUrl, () => setEntry(llmKeyPort().openEntry(baseUrl)));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="hover:bg-accent rounded-md border px-3 py-1 disabled:opacity-50"
        disabled={baseUrl.trim().length === 0}
        onClick={onEnterClick}
      >
        {t('llm.connection.enterKey')}
      </button>
      {keyed ? (
        <>
          <p role="status" className={notice({ tone: 'connected' })}>
            {t(connected ? 'llm.connection.keyVerified' : 'llm.connection.keyEntered')}
          </p>
          <button
            type="button"
            className="hover:bg-accent rounded-md border px-3 py-1"
            onClick={() => llmKeyPort().forgetKey(baseUrl)}
          >
            {t('llm.connection.removeKey')}
          </button>
        </>
      ) : null}
      {entry === 'opened' ? null : (
        <p role="alert" className={notice({ tone: 'failed' })}>
          {t(ENTRY_FAILURE_MESSAGE[entry])}
        </p>
      )}
    </div>
  );
}
