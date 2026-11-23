import { cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

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

const URL_EXAMPLE = 'http://127.0.0.1:11434/v1';

const ENTRY_FAILURE_MESSAGE = {
  unready: 'llm.connection.entryUnready',
  blocked: 'llm.connection.entryBlocked',
} as const satisfies Record<Exclude<LlmKeyEntryResult, 'opened'>, MessageKey>;

export interface LlmEndpointFieldProps {
  readonly profileId: string | null;
  readonly onProfile: (profileId: string) => void;
  readonly className?: string | undefined;
  readonly example?: string | undefined;
  readonly status?: React.ReactNode;
  readonly onConnected?: ((models: readonly string[]) => void) | undefined;
}

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
  const [draft, setDraft] = useState(profile?.baseUrl ?? '');
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (profileId !== null) useLlmProfilesStore.getState().autoCheck(profileId);
  }, [profileId]);
  const urls = useSettingsStore((state) => state.llmUrlHistory);

  const consent = useCloudConsent();

  const connect = (): void => {
    const url = draft.trim();
    if (url.length === 0) return;
    consent.confirmFor(url, () => connectTo(url));
  };

  const connectTo = (url: string): void => {
    const store = useLlmProfilesStore.getState();
    const id = profileForConnect(store.profiles, url, profile)?.id ?? store.add();
    store.update(id, { baseUrl: url, keyRequired: hasLlmKeyNow(url) });
    if (id !== profileId) onProfile(id);
    const connected = id;
    void store.check(connected).then(() => {
      const result = useLlmProfilesStore.getState().checks[connected];
      if (result?.kind === 'ok') onConnected?.(result.models);
    });
  };

  const connected =
    check?.kind === 'ok' && profile !== undefined && sameBaseUrl(profile.baseUrl, draft);

  const awaitingKey = useRef<string | null>(null);
  const onEntryOpened = (url: string): void => {
    awaitingKey.current = connected ? null : url.trim();
  };
  const onKeySet = useEffectEvent((url: string) => {
    const pending = awaitingKey.current;
    if (pending === null || !sameBaseUrl(pending, url)) return;
    awaitingKey.current = null;
    connectTo(pending);
  });
  useEffect(() => llmKeyPort().onKeySet((url) => onKeySet(url)), []);

  return (
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
          onEnter={() => form.current?.requestSubmit()}
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
      <KeyEntry baseUrl={draft} confirmFor={consent.confirmFor} onOpened={onEntryOpened} />
      {consent.dialog}
    </form>
  );
}

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
      <span aria-hidden className="bg-slot-image size-2 shrink-0 rounded-full" />
      {check.models.length > 0
        ? t('llm.connection.connected', { count: check.models.length })
        : t('llm.connection.noModels')}
      {keyless ? <span className="text-destructive">{t('llm.connection.noKey')}</span> : null}
    </p>
  );
}

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

function KeyEntry({
  baseUrl,
  confirmFor,
  onOpened,
}: {
  readonly baseUrl: string;
  readonly confirmFor: CloudConsent['confirmFor'];
  readonly onOpened: (baseUrl: string) => void;
}): React.ReactElement {
  const keyed = useLlmKeysStore((state) => hasLlmKey(state.keyed, baseUrl));
  const connected = useLlmProfilesStore((state) =>
    state.profiles.some(
      (profile) => sameBaseUrl(profile.baseUrl, baseUrl) && state.checks[profile.id]?.kind === 'ok',
    ),
  );
  const [entry, setEntry] = useState<LlmKeyEntryResult>('opened');
  const onEnterClick = (): void => {
    confirmFor(baseUrl, () => {
      const result = llmKeyPort().openEntry(baseUrl);
      setEntry(result);
      if (result === 'opened') onOpened(baseUrl);
    });
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
            className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6
              items-center justify-center rounded-md"
            aria-label={t('llm.connection.removeKey')}
            title={t('llm.connection.removeKey')}
            onClick={() => llmKeyPort().forgetKey(baseUrl)}
          >
            <X className="size-4" aria-hidden />
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
