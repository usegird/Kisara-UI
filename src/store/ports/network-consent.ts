import { t } from '@/i18n';
import { isRemoteHost } from '@/lib/remote-host';
import type { ComfyPort } from '@/port/comfy-port';
import type { EmbeddingPort } from '@/port/embedding-port';
import type { LlmEndpoint, LlmPort, LlmResult } from '@/port/llm-port';
import { useSettingsStore } from '@/store/use-settings-store';
import { cloudAgreed, comfyRemoteAgreed, termsAccepted } from '@/store/use-terms-store';

export class ConsentRequiredError extends Error {}

type Use = 'request' | 'socket' | 'url' | 'local';

type Plan<P> = { readonly [G in keyof P]: { readonly [K in keyof P[G]]-?: Use } };

const COMFY_PLAN: Plan<ComfyPort> = {
  connection: { check: 'request', diagnose: 'request', failureOf: 'local', systemStats: 'request' },
  definitions: { fetchAll: 'request', fetchOne: 'request', fetchFrequency: 'request' },
  run: { submit: 'request', interrupt: 'request', rejectionOf: 'local' },
  events: { connect: 'socket' },
  queue: {
    fetchQueue: 'request',
    deleteQueued: 'request',
    fetchHistory: 'request',
    fetchHistoryItem: 'request',
    fetchPromptFromImage: 'request',
    fetchWorkflowFromImage: 'request',
    fetchOutputImage: 'request',
    outputSrc: 'url',
    entryNodesOf: 'local',
    entryFailureOf: 'local',
    entryTextsOf: 'local',
    promptNodesOf: 'local',
  },
  workflows: {
    list: 'request',
    fetch: 'request',
    save: 'request',
    saveFailure: 'local',
    listTemplates: 'request',
    fetchTemplate: 'request',
    templateThumbnailSrc: 'url',
  },
  models: {
    fetchFiles: 'request',
    fetchMetadata: 'request',
    listNotes: 'request',
    fetchNotes: 'request',
    fetchPysssssNotes: 'request',
    hasNotesRoute: 'request',
    fetchModelJson: 'request',
    fetchJsonEdits: 'request',
    saveJsonEdits: 'request',
    saveNotes: 'request',
    previewSrc: 'url',
  },
  inputImages: { upload: 'request', uploadTemp: 'request', src: 'url' },
  assets: {
    fetchStyleTable: 'request',
    fetchSavedStyles: 'request',
    saveStyle: 'request',
    fetchWildcards: 'request',
    fetchWildcardEntries: 'request',
  },
  tags: {
    fetchPysssss: 'request',
    fetchDictionaries: 'request',
    fetchOverrides: 'request',
    saveDictionary: 'request',
    saveOverrides: 'request',
    removeDictionary: 'request',
  },
  runHistory: { list: 'request', fetch: 'request', save: 'request', sourcesOf: 'local' },
  chats: {
    listMetas: 'request',
    fetchChat: 'request',
    saveChat: 'request',
    removeChat: 'request',
    isFull: 'local',
  },
  library: { list: 'request', save: 'request', fetchImage: 'request', remove: 'request' },
  userFiles: { list: 'request', read: 'request', remove: 'request' },
  manager: {
    fetchVersion: 'request',
    fetchMappings: 'request',
    install: 'request',
    reboot: 'request',
  },
};

type AnyFunction = (...args: unknown[]) => unknown;

function refuse(use: Exclude<Use, 'local'>): unknown {
  const error = new ConsentRequiredError(t('api.consentRequired'));
  if (use === 'url') return null;
  if (use === 'socket') throw error;
  return Promise.reject(error);
}

function guard<P extends object>(port: P, plan: Plan<P>, allowed: () => boolean): P {
  const guarded: Record<string, Record<string, unknown>> = {};
  const groups = plan as Readonly<Record<string, Readonly<Record<string, Use>>>>;
  for (const [group, uses] of Object.entries(groups)) {
    const source = (port as Record<string, Record<string, unknown> | undefined>)[group] ?? {};
    const wrapped: Record<string, unknown> = {};
    for (const [name, use] of Object.entries(uses)) {
      const fn = source[name];
      if (typeof fn !== 'function') continue;
      const call = fn as AnyFunction;
      wrapped[name] =
        use === 'local'
          ? call
          : (...args: unknown[]) => (allowed() ? Reflect.apply(call, source, args) : refuse(use));
    }
    guarded[group] = wrapped;
  }
  return guarded as P;
}

function comfyAllowed(): boolean {
  if (!termsAccepted()) return false;
  return !isRemoteHost(useSettingsStore.getState().baseUrl) || comfyRemoteAgreed();
}

export function guardComfyPort(port: ComfyPort): ComfyPort {
  return guard(port, COMFY_PLAN, comfyAllowed);
}

function llmAllowed(endpoint: LlmEndpoint): boolean {
  return !isRemoteHost(endpoint.baseUrl) || cloudAgreed();
}

function refusedLlm<T>(): Promise<LlmResult<T>> {
  return Promise.resolve({ ok: false, failure: { kind: 'consent' } });
}

export function guardLlmPort(port: LlmPort): LlmPort {
  return {
    listModels: (endpoint, signal) =>
      llmAllowed(endpoint) ? port.listModels(endpoint, signal) : refusedLlm(),
    checkKey: (endpoint, signal) =>
      llmAllowed(endpoint) ? port.checkKey(endpoint, signal) : refusedLlm(),
    streamChat: (endpoint, request, { onEvent, signal }) =>
      llmAllowed(endpoint) ? port.streamChat(endpoint, request, { onEvent, signal }) : refusedLlm(),
  };
}

export function guardEmbeddingPort(port: EmbeddingPort): EmbeddingPort {
  return {
    load: (model, onProgress) =>
      useSettingsStore.getState().loreSemantic
        ? port.load(model, onProgress)
        : Promise.resolve({ ok: false, message: t('api.consentRequired') }),
    embed: (texts, kind) => port.embed(texts, kind),
    unload: () => port.unload(),
    stored: () => port.stored(),
    remove: (id) => port.remove(id),
  };
}
