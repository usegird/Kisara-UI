import { create } from 'zustand';

import { isCloudService } from '@/chat/cloud-service';
import { sameBaseUrl } from '@/chat/connection-profile';
import type { ConnectionProfile } from '@/chat/types';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { mergeChangedItems } from '@/lib/merge-changes';
import { isRemoteHost } from '@/lib/remote-host';
import { safeStorage } from '@/lib/safe-storage';
import type { LlmFailure, LlmKeyOutcome, ModelDetails } from '@/port/llm-port';
import { llmPort } from '@/store/ports/llm-port';
import { hasLlmKeyNow } from '@/store/use-llm-keys-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { cloudAgreed } from '@/store/use-terms-store';

export const PROFILES_KEY = 'kisaraui.llm.profiles';

type ModelCheck =
  | { readonly kind: 'checking' }
  | {
      readonly kind: 'ok';
      readonly models: readonly string[];
      readonly contexts: Readonly<Record<string, number>>;
      readonly details: Readonly<Record<string, ModelDetails>>;
      readonly serverContext: number | null;
      readonly truncated?: boolean;
    }
  | { readonly kind: 'failed'; readonly failure: LlmFailure };

type ProfilePatch = Partial<Omit<ConnectionProfile, 'id'>>;

interface LlmProfilesState {
  readonly profiles: readonly ConnectionProfile[];
  readonly checks: Readonly<Record<string, ModelCheck>>;
  readonly learned: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly learnContext: (id: string, model: string, context: number) => void;
  readonly add: () => string;
  readonly update: (id: string, patch: ProfilePatch) => void;
  readonly remove: (id: string) => void;
  readonly forgetUrl: (url: string, keep: string | null) => void;
  readonly check: (id: string) => Promise<void>;
  readonly autoCheck: (id: string) => void;
  readonly resumeKeyed: () => void;
  readonly verifyKey: (baseUrl: string) => Promise<LlmKeyOutcome>;
}

function readJson(key: string): unknown {
  try {
    const text = safeStorage().getItem(key);
    return typeof text === 'string' && text.length > 0 ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

export function loadProfiles(): ConnectionProfile[] {
  const raw = readJson(PROFILES_KEY);
  if (!isUnknownArray(raw)) return [];
  return raw.flatMap((item) =>
    isRecord(item) && typeof item.id === 'string'
      ? [
          {
            id: item.id,
            baseUrl: stringOr(item.baseUrl),
            keyRequired: item.keyRequired === true,
            defaultModel: stringOr(item.defaultModel),
          },
        ]
      : [],
  );
}

type StoredProfile = Pick<ConnectionProfile, 'id' | 'baseUrl' | 'keyRequired' | 'defaultModel'>;

function storedForm(profiles: readonly ConnectionProfile[]): StoredProfile[] {
  return profiles.map(({ id, baseUrl, keyRequired, defaultModel }) => ({
    id,
    baseUrl,
    keyRequired,
    defaultModel,
  }));
}

export function saveProfiles(
  profiles: readonly ConnectionProfile[],
  previous?: readonly ConnectionProfile[],
): void {
  const next = storedForm(profiles);
  const value =
    previous === undefined
      ? next
      : mergeChangedItems(readJson(PROFILES_KEY), storedForm(previous), next);
  safeStorage('local').setItem(PROFILES_KEY, JSON.stringify(value));
}

const checking = new Map<string, AbortController>();

const autoChecked = new Set<string>();

const waitingForKey = new Set<string>();

export function wasAutoChecked(id: string): boolean {
  return autoChecked.has(id);
}

export function contextLengthOf(
  check: ModelCheck | undefined,
  model: string,
  learned?: number,
): number | null {
  if (learned !== undefined) return learned;
  if (check?.kind !== 'ok') return null;
  return check.serverContext ?? check.contexts[model] ?? null;
}

const unconfirmed = new Set<string>();

function confirmed(profiles: readonly ConnectionProfile[]): readonly ConnectionProfile[] {
  return profiles.filter((profile) => !unconfirmed.has(profile.id));
}

export const useLlmProfilesStore = create<LlmProfilesState>()((set, get) => {
  const commit = (profiles: readonly ConnectionProfile[]): void => {
    const previous = get().profiles;
    set({ profiles });
    saveProfiles(confirmed(profiles), confirmed(previous));
  };

  return {
    profiles: loadProfiles(),
    checks: {},
    learned: {},

    learnContext: (id, model, context) => {
      const learned = get().learned;
      if (learned[id]?.[model] === context) return;
      set({ learned: { ...learned, [id]: { ...learned[id], [model]: context } } });
    },

    add: () => {
      const id = newShortId();
      unconfirmed.add(id);
      commit([...get().profiles, { id, baseUrl: '', keyRequired: false, defaultModel: '' }]);
      return id;
    },

    update: (id, patch) => {
      commit(
        get().profiles.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)),
      );
    },

    remove: (id) => {
      checking.get(id)?.abort();
      checking.delete(id);
      const checks = { ...get().checks };
      delete checks[id];
      set({ checks });
      commit(without(get().profiles, id));
      unconfirmed.delete(id);
    },

    autoCheck: (id) => {
      if (autoChecked.has(id)) return;
      autoChecked.add(id);
      const profile = get().profiles.find((item) => item.id === id);
      if (profile === undefined || profile.baseUrl.trim().length === 0) return;
      if (get().checks[id] !== undefined) return;
      if (isRemoteHost(profile.baseUrl) && !cloudAgreed()) return;
      if (profile.keyRequired && !hasLlmKeyNow(profile.baseUrl)) {
        waitingForKey.add(id);
        return;
      }
      void get().check(id);
    },

    resumeKeyed: () => resumeWaiting(get()),

    check: async (id) => {
      const profile = get().profiles.find((item) => item.id === id);
      if (profile === undefined) return;
      checking.get(id)?.abort();
      const controller = new AbortController();
      checking.set(id, controller);
      set({ checks: { ...get().checks, [id]: { kind: 'checking' } } });

      const result = await fetchCheckedModels(profile.baseUrl, controller.signal);
      if (checking.get(id) !== controller) return;
      checking.delete(id);
      set({ checks: { ...get().checks, [id]: modelCheckOf(result) } });
      if (!result.ok) return;
      useSettingsStore.getState().rememberLlmUrl(profile.baseUrl);
      if (unconfirmed.delete(id)) {
        const profiles = confirmed(get().profiles);
        saveProfiles(profiles, without(profiles, id));
      }
    },

    verifyKey: (baseUrl) => verifyKeyWith(get, baseUrl),

    forgetUrl: (url, keep) => {
      const gone = get().profiles.filter(
        (profile) => profile.id !== keep && sameBaseUrl(profile.baseUrl, url),
      );
      for (const profile of gone) get().remove(profile.id);
    },
  };
});

type ModelListResult = Awaited<ReturnType<ReturnType<typeof llmPort>['listModels']>>;

async function fetchCheckedModels(baseUrl: string, signal?: AbortSignal): Promise<ModelListResult> {
  const endpoint = { baseUrl };
  const result = await llmPort().listModels(endpoint, signal);
  if (!result.ok || !hasLlmKeyNow(baseUrl) || !isCloudService(baseUrl)) return result;
  const key = await llmPort().checkKey(endpoint, signal);
  if (!key.ok && key.failure.kind === 'auth') return { ok: false, failure: key.failure };
  return result;
}

function modelCheckOf(result: ModelListResult): ModelCheck {
  if (!result.ok) return { kind: 'failed', failure: result.failure };
  return {
    kind: 'ok',
    models: result.value.ids,
    contexts: result.value.contexts,
    details: result.value.details,
    serverContext: result.value.serverContext,
    truncated: result.value.truncated,
  };
}

function resumeWaiting(state: LlmProfilesState): void {
  for (const id of waitingForKey) {
    const profile = state.profiles.find((item) => item.id === id);
    if (profile === undefined || !hasLlmKeyNow(profile.baseUrl)) continue;
    waitingForKey.delete(id);
    if (state.checks[id] === undefined) void state.check(id);
  }
}

async function verifyKeyWith(
  get: () => LlmProfilesState,
  baseUrl: string,
): Promise<LlmKeyOutcome> {
  const same = get().profiles.filter((profile) => sameBaseUrl(profile.baseUrl, baseUrl));
  const [first] = same;
  if (first === undefined) return keyOutcomeOf(modelCheckOf(await fetchCheckedModels(baseUrl)));
  await Promise.all(same.map((profile) => get().check(profile.id)));
  return keyOutcomeOf(get().checks[first.id]);
}

function keyOutcomeOf(check: ModelCheck | undefined): LlmKeyOutcome {
  if (check?.kind === 'ok') return 'ok';
  return check?.kind === 'failed' && check.failure.kind === 'auth' ? 'auth' : 'failed';
}

function without(profiles: readonly ConnectionProfile[], id: string): readonly ConnectionProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}
