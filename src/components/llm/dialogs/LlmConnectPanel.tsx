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

const CORS_LABEL = {
  required: 'llm.onboarding.corsRequired',
  recommended: 'llm.onboarding.corsRecommended',
  unavailable: 'llm.onboarding.corsUnavailable',
  notNeeded: 'llm.onboarding.corsNotNeeded',
} as const satisfies Record<CorsLevel, string>;

interface LlmTarget {
  readonly profileId: string | null;
  readonly model: string;
}

export interface LlmConnectPanelProps {
  readonly target: LlmTarget;
  readonly onChange: (patch: Partial<LlmTarget>) => void;
  readonly action?: React.ReactNode;
  readonly inDialog?: boolean | undefined;
}

const panelFrame = cva('mx-auto w-full', {
  variants: { inDialog: { true: 'px-5 py-4', false: 'max-w-2xl px-6 py-10' } },
});

function LlmConnectPanel({
  target,
  onChange,
  action,
  inDialog = false,
}: LlmConnectPanelProps): React.ReactElement {
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
      <SecurityNotes notes={llmLanding().notes} />
    </section>
  );
}

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

const URL_MARK = '\u0000url\u0000';

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
  readonly example: string;
}): React.ReactElement {
  return (
    <li>
      <p className="font-medium">{t('llm.onboarding.connect')}</p>
      <p className="text-muted-foreground mt-1 text-xs">{t('llm.onboarding.connectNote')}</p>
      <div className="mt-2 flex flex-col gap-2">
        <LlmEndpointField
          key={target.profileId ?? 'none'}
          className="min-w-72"
          profileId={target.profileId}
          example={example}
          status={<LlmConnectionNotice profileId={target.profileId} />}
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
        <LlmConnectionFailure profileId={target.profileId} />
      </div>
    </li>
  );
}

function ModelStep({ action }: Pick<LlmConnectPanelProps, 'action'>): React.ReactElement {
  return (
    <li>
      <p className="font-medium">{t('llm.onboarding.chooseModel')}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">{action}</div>
    </li>
  );
}

export interface LlmSetupPanelProps {
  readonly initial?: LlmTarget | undefined;
  readonly onStart: (target: LlmTarget) => void;
  readonly startLabel?: string | undefined;
  readonly inDialog?: boolean | undefined;
}

function onlyModel(models: readonly string[]): string {
  return models.length === 1 ? (models[0] ?? '') : '';
}

export function LlmSetupPanel({
  initial,
  onStart,
  startLabel,
  inDialog,
}: LlmSetupPanelProps): React.ReactElement {
  const first = useLlmProfilesStore.getState().profiles[0];
  const [target, setTarget] = useState<LlmTarget>(
    initial !== undefined && initial.profileId !== null
      ? initial
      : { profileId: first?.id ?? null, model: initial?.model || first?.defaultModel || '' },
  );
  const ready = useLlmProfilesStore((state) =>
    state.profiles.some((item) => item.id === target.profileId && item.baseUrl.trim().length > 0),
  );
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
