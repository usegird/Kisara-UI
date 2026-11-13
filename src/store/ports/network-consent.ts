import { t } from '@/i18n';
import { isRemoteHost } from '@/lib/remote-host';
import type { ComfyPort } from '@/port/comfy-port';
import type { EmbeddingPort } from '@/port/embedding-port';
import type { LlmEndpoint, LlmPort, LlmResult } from '@/port/llm-port';
import { useSettingsStore } from '@/store/use-settings-store';
import { cloudAgreed, comfyRemoteAgreed, termsAccepted } from '@/store/use-terms-store';

// ─────────────────────────────
// 通信の前の同意の関門。**同意を確かめるのはここだけ。** 3 つの受け口（ComfyUI・LLM・近似判定）が、
// 入口から入れられた実装をここで包む。部品とフックの確認は案内を出すためだけに置く。
// ─────────────────────────────

/** 同意が無いので通信しなかった */
export class ConsentRequiredError extends Error {}

/**
 * 窓口の関数の使い方。
 * - `request` … 非同期に通信する。断るときは失敗した Promise を返す
 * - `socket` … 通知の接続を張る（同期）。断るときは投げる
 * - `url` … 画面が読み込む URL を作る。断るときは null を返す（描くのを止めない）
 * - `local` … 通信しない（失敗の読み分けなど）。そのまま通す
 */
type Use = 'request' | 'socket' | 'url' | 'local';

type Plan<P> = { readonly [G in keyof P]: { readonly [K in keyof P[G]]-?: Use } };

// ComfyUI の窓口の関数は、すべてこの表で使い方を分ける。表に無い関数があると型の検査で落ちるので、
// 窓口に関数を足しても関門を素通りしない
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
    saveNotes: 'request',
    previewSrc: 'url',
  },
  inputImages: { upload: 'request', uploadTemp: 'request', src: 'url' },
  assets: {
    fetchStyleTable: 'request',
    fetchSavedStyles: 'request',
    saveStyle: 'request',
    fetchWildcards: 'request',
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
};

type AnyFunction = (...args: unknown[]) => unknown;

function refuse(use: Exclude<Use, 'local'>): unknown {
  const error = new ConsentRequiredError(t('api.consentRequired'));
  if (use === 'url') return null;
  if (use === 'socket') throw error;
  return Promise.reject(error);
}

/** 表に従って窓口を包む。同意を確かめるのは呼ぶたび（同意した後は包み直さずに通す） */
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
  // 表は型で ComfyPort のすべての関数を持つので、包んだ物は同じ形になる
  return guarded as P;
}

/** 今の接続先へ送ってよいか。利用規約への同意と、私的なアドレスの外なら外部の ComfyUI の注意への合意 */
function comfyAllowed(): boolean {
  if (!termsAccepted()) return false;
  return !isRemoteHost(useSettingsStore.getState().baseUrl) || comfyRemoteAgreed();
}

/** ComfyUI の窓口を、利用規約への同意（と外部の宛先の注意への合意）で包む */
export function guardComfyPort(port: ComfyPort): ComfyPort {
  return guard(port, COMFY_PLAN, comfyAllowed);
}

/** その宛先へ送ってよいか。私的なアドレスの外なら注意への合意が要る */
function llmAllowed(endpoint: LlmEndpoint): boolean {
  return !isRemoteHost(endpoint.baseUrl) || cloudAgreed();
}

function refusedLlm<T>(): Promise<LlmResult<T>> {
  return Promise.resolve({ ok: false, failure: { kind: 'consent' } });
}

/** LLM の窓口を、外部クラウド接続の注意への合意で包む。関数を足したら、ここに書かないと型が通らない */
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

/** 近似判定の窓口を包む。外から落とすのはモデルの読み込みだけで、ほかは端末の中で済む */
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
