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

// ─────────────────────────────
// LLM の接続の設定（複数の会話から使う）。小さい保存領域に置く。API キーは持たない（ゲートウェイが持つ）。
// モデルの一覧と文脈長も残さない。
// ─────────────────────────────

export const PROFILES_KEY = 'kisaraui.llm.profiles';

/** 確かめた結果（モデルの一覧と文脈長） */
type ModelCheck =
  | { readonly kind: 'checking' }
  | {
      readonly kind: 'ok';
      readonly models: readonly string[];
      readonly contexts: Readonly<Record<string, number>>;
      /**
       * モデルごとの付帯情報（返すサーバーだけ）
       */
      readonly details: Readonly<Record<string, ModelDetails>>;
      readonly serverContext: number | null;
      /**
       * 上限の件数を超えた分を捨てたか
       */
      readonly truncated?: boolean;
    }
  | { readonly kind: 'failed'; readonly failure: LlmFailure };

/** 接続の設定の直す分（id は変えない） */
type ProfilePatch = Partial<Omit<ConnectionProfile, 'id'>>;

/** 接続の設定の一覧・確かめた結果と、その操作 */
interface LlmProfilesState {
  readonly profiles: readonly ConnectionProfile[];
  readonly checks: Readonly<Record<string, ModelCheck>>;
  /** サーバーの断りで知った文脈長（設定の id → モデル → 長さ）。接続で読んだ値より先に使う */
  readonly learned: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /**
   * 断りで知った文脈長を覚える
   */
  readonly learnContext: (id: string, model: string, context: number) => void;
  /** 空の設定を足す。返り値は id */
  readonly add: () => string;
  readonly update: (id: string, patch: ProfilePatch) => void;
  readonly remove: (id: string) => void;
  /** 接続先の履歴の × で、同じベース URL の設定も消す。`keep`（選んでいる設定）は残す */
  readonly forgetUrl: (url: string, keep: string | null) => void;
  /** モデルの一覧を取る（`GET /models`） */
  readonly check: (id: string) => Promise<void>;
  /**
   * 自動で 1 回だけ試す。ページを開いてからその設定を一度も試しておらず、
   * ベース URL があるときだけ取る。失敗しても繰り返さない
   */
  readonly autoCheck: (id: string) => void;
  /**
   * 自動でつなぐのをキーが無くて見送った設定に、ゲートウェイがキーを戻したらつなぐ
   */
  readonly resumeKeyed: () => void;
  /**
   * 入力の窓で入ったキーを、接続と同じ規則で確かめる。同じベース URL の設定があれば、その接続の状況も替える
   */
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

/** 残した設定を読む */
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

/**
 * 書く。`previous`（このタブの前の一覧）を
 * 渡すと、置き場を読み直し、このタブで足した・直した・消した 1 件だけを重ねる
 */
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

/** 確かめている要求。同じ設定を続けて確かめたら前のものを止める */
const checking = new Map<string, AbortController>();

/** このページで自動で試した設定（1 回だけにする） */
const autoChecked = new Set<string>();

/** 自動でつなぐのを、キーが無くて見送った設定 */
const waitingForKey = new Set<string>();

/**
 * このページでその設定を自動で試したか（試していなければ、つながるかはまだ分からない）。
 * 試したときは確かめた結果も入れるので、ストアを購読するセレクタの中で読んでよい
 */
export function wasAutoChecked(id: string): boolean {
  return autoChecked.has(id);
}

/**
 * モデルの文脈長。断りで知った値（`learned`）を先に、次にサーバーの起動時の設定、無ければ一覧の値。
 * わからなければ null（プロンプトのタブの合計の上限に使う）
 */
export function contextLengthOf(
  check: ModelCheck | undefined,
  model: string,
  learned?: number,
): number | null {
  if (learned !== undefined) return learned;
  if (check?.kind !== 'ok') return null;
  return check.serverContext ?? check.contexts[model] ?? null;
}

/**
 * 足したが、まだ一度もつながっていない設定。画面の中だけに持ち、つながったら端末に書く
 * （打ち間違えた URL の設定を残さない）
 */
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
      // 私的なアドレスの外には、注意に合意するまで自動でつながない
      if (isRemoteHost(profile.baseUrl) && !cloudAgreed()) return;
      // キーが要るのにまだゲートウェイに無い（開いた直後）。ゲートウェイがキーを戻したら resumeKeyed でつなぐ
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
      // つながったベース URL だけを履歴に残し、最後につないだものを先頭にする
      useSettingsStore.getState().rememberLlmUrl(profile.baseUrl);
      // つながった設定だけを端末に残す（打ち間違えた URL の設定は増やさない）
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

/** モデルの一覧を取った結果 */
type ModelListResult = Awaited<ReturnType<ReturnType<typeof llmPort>['listModels']>>;

/**
 * モデルの一覧を取る。OpenRouter はモデルの一覧をキー無しでも返すので、入れたキーが通るかを別に
 * 確かめる。断られたときだけ失敗にする（届かないなどは一覧が取れていれば続ける）
 */
async function fetchCheckedModels(baseUrl: string, signal?: AbortSignal): Promise<ModelListResult> {
  const endpoint = { baseUrl };
  const result = await llmPort().listModels(endpoint, signal);
  if (!result.ok || !hasLlmKeyNow(baseUrl) || !isCloudService(baseUrl)) return result;
  const key = await llmPort().checkKey(endpoint, signal);
  if (!key.ok && key.failure.kind === 'auth') return { ok: false, failure: key.failure };
  return result;
}

/** 一覧を取った結果を、確かめた状態にする */
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

/** キーが無くて自動でつなぐのを見送った設定のうち、キーが戻ったものをつなぐ */
function resumeWaiting(state: LlmProfilesState): void {
  for (const id of waitingForKey) {
    const profile = state.profiles.find((item) => item.id === id);
    if (profile === undefined || !hasLlmKeyNow(profile.baseUrl)) continue;
    // 待つのは 1 回だけ（自動でつなぐのはページを開いてから 1 回）
    waitingForKey.delete(id);
    if (state.checks[id] === undefined) void state.check(id);
  }
}

/** 入ったキーを確かめる。同じベース URL の設定があれば、それをつなぎ直して結果を読む */
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

/** 確かめた状態を、入力の窓へ返す結果にする（取り直しで追い越されて確かめ中のままなら失敗） */
function keyOutcomeOf(check: ModelCheck | undefined): LlmKeyOutcome {
  if (check?.kind === 'ok') return 'ok';
  return check?.kind === 'failed' && check.failure.kind === 'auth' ? 'auth' : 'failed';
}

function without(profiles: readonly ConnectionProfile[], id: string): readonly ConnectionProfile[] {
  return profiles.filter((profile) => profile.id !== id);
}
