import { cva } from 'class-variance-authority';
import { useState } from 'react';

import {
  CLOUD_SERVERS,
  firstServer,
  ollamaAllows,
  SERVERS,
  type CorsLevel,
  type ServerGuide,
} from '@/chat/server-guides';
import { llmLanding } from '@/components/llm/landing';
import {
  LlmConnectionFailure,
  LlmConnectionNotice,
  LlmEndpointField,
} from '@/components/llm/side-panel/LlmEndpointField';
import { SecurityNotes } from '@/components/ui/security-notes';
import { t } from '@/i18n';
import { pageOrigin } from '@/lib/host';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

// ─────────────────────────────
// LLM の接続の案内。会話のタブの「LLM に接続する」のダイアログと、新しいタブの左の段で同じものを使う。
// どの接続の設定とモデルを使うかは呼び出し側が持つ。
// ─────────────────────────────

/** CORS の設定の区分の文言。サーバーの表は `chat/server-guides`、押した 1 つだけを開く */
const CORS_LABEL = {
  required: 'llm.onboarding.corsRequired',
  recommended: 'llm.onboarding.corsRecommended',
  unavailable: 'llm.onboarding.corsUnavailable',
  notNeeded: 'llm.onboarding.corsNotNeeded',
} as const satisfies Record<CorsLevel, string>;

/** 使う接続の設定とモデル */
interface LlmTarget {
  readonly profileId: string | null;
  readonly model: string;
}

/** 接続の案内の props */
export interface LlmConnectPanelProps {
  readonly target: LlmTarget;
  readonly onChange: (patch: Partial<LlmTarget>) => void;
  /** 3 つ目の手順の下に置くもの（新しいタブの「会話を始める」） */
  readonly action?: React.ReactNode;
  /** ダイアログの中に置く（題名はダイアログの見出しの帯に出すので、ここでは出さない） */
  readonly inDialog?: boolean | undefined;
}

/** 案内の枠。ダイアログの中では題名を出さず、余白をダイアログに合わせる */
const panelFrame = cva('mx-auto w-full', {
  variants: { inDialog: { true: 'px-5 py-4', false: 'max-w-2xl px-6 py-10' } },
});

/**
 * 3 つの手順（起動する・接続する・会話を始める）を縦に並べる。API キーは端末に残さず、
 * ブラウザのパスワード管理に任せる
 */
function LlmConnectPanel({
  target,
  onChange,
  action,
  inDialog = false,
}: LlmConnectPanelProps): React.ReactElement {
  // 最後に開いたサーバー。そのベース URL を接続の欄の例にする（端末には残さない）
  const [server, setServer] = useState<ServerGuide>(firstServer);
  return (
    <section className={panelFrame({ inDialog })}>
      {inDialog ? null : (
        <h2 className="mb-6 text-lg font-semibold">{t('llm.onboarding.title')}</h2>
      )}
      <ol className="space-y-5 text-sm">
        <LaunchStep onOpen={setServer} />
        <ConnectStep target={target} onChange={onChange} example={server.url} />
        <ModelStep action={action} />
      </ol>
      {/* 外部のクラウドに送る中身・料金・キーの注意 */}
      <SecurityNotes notes={llmLanding().notes} />
    </section>
  );
}

/**
 * どのサーバーも同じ並び（モデルの指定が要るときだけその行・API キーの発行・CORS の設定の区分）。
 * ベース URL は書かない（開くと接続の欄の例になる）
 */
function CorsNote({
  server,
  local,
}: {
  readonly server: ServerGuide;
  readonly local: boolean;
}): React.ReactElement {
  const cors = server.cors(local);
  return (
    <p className="text-muted-foreground mt-1">
      {server.modelRequired ? (
        <span className="block">{t('llm.onboarding.modelRequired')}</span>
      ) : null}
      {server.keyAt === undefined ? null : (
        <>
          <span className="block">
            <KeyIssueText url={server.keyAt} />
          </span>
          <span className="block">{t('llm.onboarding.keyAdvice')}</span>
        </>
      )}
      {cors === null ? null : (
        <span className="block">{t(CORS_LABEL[cors.level], { reason: t(cors.reason) })}</span>
      )}
    </p>
  );
}

/** 文言の中の `{url}` の位置に置く目印（訳ごとに位置が変わるので、置いた後で分けてリンクに替える） */
const URL_MARK = '\u0000url\u0000';

/** API キーの発行の行。発行する場所は別のタブで開くリンクにする */
function KeyIssueText({ url }: { readonly url: string }): React.ReactElement {
  const [before = '', after = ''] = t('llm.onboarding.apiKeyRequired', { url: URL_MARK }).split(
    URL_MARK,
  );
  return (
    <>
      {before}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="focus-visible:outline-ring rounded-sm underline underline-offset-2 focus-visible:outline-2"
      >
        {url}
      </a>
      {after}
    </>
  );
}

function LaunchStep({
  onOpen,
}: {
  readonly onOpen: (server: ServerGuide) => void;
}): React.ReactElement {
  const origin = pageOrigin();
  const local = ollamaAllows(origin);
  return (
    <li>
      <p className="font-medium">{t('llm.onboarding.start')}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        {t('llm.onboarding.startNote', { origin })}
      </p>
      <ServerList servers={SERVERS} origin={origin} local={local} onOpen={onOpen} />
      <p className="text-muted-foreground mt-3 text-xs">{t('llm.onboarding.cloudNote')}</p>
      <ServerList servers={CLOUD_SERVERS} origin={origin} local={local} onOpen={onOpen} />
    </li>
  );
}

/** サーバーの一覧。ローカルとクラウドで同じ名前を使い、両方を通して押した 1 つだけを開く */
function ServerList({
  servers,
  origin,
  local,
  onOpen,
}: {
  readonly servers: readonly ServerGuide[];
  readonly origin: string;
  readonly local: boolean;
  readonly onOpen: (server: ServerGuide) => void;
}): React.ReactElement {
  return (
    <div className="mt-2 flex flex-col gap-1 text-xs">
      {servers.map((server) => (
        <details
          key={server.key}
          name="llm-server"
          className="rounded-md border px-3 py-1.5"
          onToggle={(event) => {
            if (event.currentTarget.open) onOpen(server);
          }}
        >
          <summary className="cursor-pointer font-medium select-none">{server.name}</summary>
          {server.commands(origin, local).map((sample) => (
            <figure key={sample.label} className="bg-muted mt-1 rounded">
              <figcaption className="text-muted-foreground border-border border-b px-2 py-1 font-mono">
                {sample.label}
              </figcaption>
              <code className="block px-2 py-1 font-mono break-all">{sample.command}</code>
            </figure>
          ))}
          <CorsNote server={server} local={local} />
        </details>
      ))}
    </div>
  );
}

function ConnectStep({
  target,
  onChange,
  example,
}: Pick<LlmConnectPanelProps, 'target' | 'onChange'> & {
  /** 接続の欄の例（最後に開いたサーバーのベース URL） */
  readonly example: string;
}): React.ReactElement {
  return (
    <li>
      <p className="font-medium">{t('llm.onboarding.connect')}</p>
      <p className="text-muted-foreground mt-1 text-xs">{t('llm.onboarding.connectNote')}</p>
      <div className="mt-2 flex flex-col gap-2">
        {/* 管理名・ベース URL・API キーのフォーム。選んでいる設定が替わったら、打ちかけの値をその設定の物にし直す */}
        <LlmEndpointField
          key={target.profileId ?? 'none'}
          className="min-w-72"
          profileId={target.profileId}
          example={example}
          // 接続の状況は接続のボタンの右に出す（右の列と同じ）
          status={<LlmConnectionNotice profileId={target.profileId} />}
          // つないだらモデルを選び直す。使っていたモデルが一覧にあればそのまま、無ければ一覧に
          // 1 つだけならそれ、ほかは未選択
          onConnected={(models) =>
            onChange({ model: models.includes(target.model) ? target.model : onlyModel(models) })
          }
          onProfile={(profileId) => {
            const chosen = useLlmProfilesStore.getState().profiles.find((p) => p.id === profileId);
            onChange({
              profileId,
              ...(target.model.length === 0 && chosen !== undefined
                ? { model: chosen.defaultModel }
                : {}),
            });
          }}
        />
        {/* API キーの下に、ローカルネットワークの許可の案内と接続の失敗（右の列と同じ） */}
        <LlmConnectionFailure profileId={target.profileId} />
      </div>
    </li>
  );
}

/**
 * 3 つ目の手順。「会話を始める」だけを置く（モデルは会話の画面の入力欄の横で選ぶ）
 */
function ModelStep({ action }: Pick<LlmConnectPanelProps, 'action'>): React.ReactElement {
  return (
    <li>
      <p className="font-medium">{t('llm.onboarding.chooseModel')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div>
    </li>
  );
}

/** 「会話を始める」を足した接続の案内の props */
export interface LlmSetupPanelProps {
  /** 初めに選んでおくもの。無ければ最初の接続の設定とその既定のモデル */
  readonly initial?: LlmTarget | undefined;
  /** 「会話を始める」を押したとき */
  readonly onStart: (target: LlmTarget) => void;
  /** ボタンの文言。無ければ「会話を始める」（新しいタブの案内では「UI を起動」） */
  readonly startLabel?: string | undefined;
  /** ダイアログの中に置く */
  readonly inDialog?: boolean | undefined;
}

/** 取った一覧にモデルが 1 つだけならそれ。無い・複数なら未選択（空） */
function onlyModel(models: readonly string[]): string {
  return models.length === 1 ? (models[0] ?? '') : '';
}

/**
 * 接続の案内に「会話を始める」を足したもの。選んでいる間は手元に持ち、押したときにだけ渡す
 * （モデルを 1 文字打っただけで会話の画面に切り替わらないように）。
 * 新しいタブの左の段と、会話のタブの接続の案内で使う
 */
export function LlmSetupPanel({
  initial,
  onStart,
  startLabel,
  inDialog,
}: LlmSetupPanelProps): React.ReactElement {
  const first = useLlmProfilesStore.getState().profiles[0];
  // 接続の設定を選んでいなければ（一覧から消えたときも）、最初のものとその既定のモデルから始める
  const [target, setTarget] = useState<LlmTarget>(
    initial !== undefined && initial.profileId !== null
      ? initial
      : { profileId: first?.id ?? null, model: initial?.model || first?.defaultModel || '' },
  );
  const ready = useLlmProfilesStore((state) =>
    state.profiles.some((item) => item.id === target.profileId && item.baseUrl.trim().length > 0),
  );
  // モデルが決まっていなければ、接続の設定の既定か、取った一覧にモデルが 1 つだけならそれで始める
  const start = (): void => {
    const store = useLlmProfilesStore.getState();
    const profile = store.profiles.find((item) => item.id === target.profileId);
    const check = target.profileId === null ? undefined : store.checks[target.profileId];
    const listed = check?.kind === 'ok' ? onlyModel(check.models) : '';
    const model = target.model.trim() || profile?.defaultModel || listed;
    onStart({ ...target, model });
  };
  return (
    <LlmConnectPanel
      target={target}
      inDialog={inDialog}
      onChange={(patch) => setTarget((current) => ({ ...current, ...patch }))}
      action={
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm
            disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!ready}
          title={ready ? undefined : t('llm.chat.cannotSend')}
          onClick={start}
        >
          {startLabel ?? t('llm.onboarding.startChat')}
        </button>
      }
    />
  );
}
