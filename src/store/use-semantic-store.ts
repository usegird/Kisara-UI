import { create } from 'zustand';

import type { LoreSource } from '@/chat/lore';
import {
  baselineOf,
  NO_SEMANTIC_HITS,
  pickSemanticHits,
  semanticQuery,
  semanticTargets,
  similarity,
  type SemanticHits,
  type SemanticQuery,
  type SemanticScore,
  type SemanticTarget,
} from '@/chat/semantic';
import { semanticModelFor, type SemanticModel } from '@/chat/semantic-models';
import type { ChatMessage } from '@/chat/types';
import { activeLocale } from '@/i18n';
import type { StoredEmbeddingModel } from '@/port/embedding-port';
import { embeddingPort } from '@/store/ports/embedding-port';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 近似判定。モデルの読み込みの状態と、送るときの当たりを受け持つ。計算した埋め込みはページを開いている
// 間だけ覚え、同じ本文は計算し直さない。落としたモデルは無効にしても残し、消すのは利用者が選んだときだけ。
// ─────────────────────────────

/** 近似判定のモデルの段階 */
export type SemanticStatus = 'off' | 'loading' | 'ready' | 'failed';

/** 見込みの当たりと、それを作った比べる物の鍵 */
interface SemanticPreview {
  readonly key: string;
  readonly hits: SemanticHits;
}

interface SemanticState {
  readonly status: SemanticStatus;
  /** 読み込みの進み具合（0〜1。読み込み中だけ使う） */
  readonly progress: number;
  /** 読めなかった理由（ライブラリの文） */
  readonly error: string;
  /** 読んだモデルの id。読んでいなければ null */
  readonly loadedId: string | null;
  /** このブラウザに置いたモデル（機能のタブに 1 つ 1 行で出す） */
  readonly stored: readonly StoredEmbeddingModel[];
  /** プロンプトのタブの見込みに出す当たり（会話ごと。比べた物の鍵と一緒に持つ。残さない） */
  readonly previews: Readonly<Record<string, SemanticPreview>>;
  /**
   * 会話履歴と打ちかけのメッセージで近似判定し、見込みの当たりを作り直す（メッセージの入力欄から
   * 焦点が外れたとき。比べる物が同じなら何もしない）
   */
  readonly preview: (
    chatId: string,
    sources: readonly LoreSource[],
    messages: readonly ChatMessage[],
    draft: string,
  ) => void;
  /** 送るときに行った近似判定の当たりを、見込みにも使う */
  readonly setPreview: (chatId: string, hits: SemanticHits) => void;
  /** モデルを読む（無ければ落とす）。有効にしたとき・ページを開いたとき・やり直すとき */
  readonly load: () => Promise<void>;
  /** 有効をやめ、読んだモデルをメモリから降ろす（落とした物は残す） */
  readonly disable: () => Promise<void>;
  /** このブラウザに置いたモデルの一覧を読み直す */
  readonly refreshStored: () => Promise<void>;
  /** そのモデルの落とした物を消す。使っているモデルなら近似判定も無効にする */
  readonly remove: (id: string) => Promise<void>;
}

/** 読んだモデル（下限を使う）。読む前は null */
let current: SemanticModel | null = null;

/** ありふれた発言のベクトル（モデルを読んだときに受け取る） */
let generic: readonly Float32Array[] = [];

/** 比べる文のベクトルと、ふだんの近さ。埋め込み方と文で引く */
const passages = new Map<string, { readonly vector: Float32Array; readonly baseline: number }>();

/** 読み込みの世代。無効にしたら進め、古い読み込みの結果を捨てる */
let generation = 0;

/** 比べる物の鍵（発言と対象の本文）。同じなら計算し直さない */
function previewKey(
  sources: readonly LoreSource[],
  messages: readonly ChatMessage[],
  draft: string,
): string {
  const targets = semanticTargets(sources);
  return JSON.stringify([
    semanticQuery(messages, draft),
    targets.map((t) => [t.sourceId, t.index, t.kind, t.text]),
  ]);
}

/** 計算中の見込みの鍵（会話ごと）。同じ物を二重に頼まない */
const computing = new Map<string, string>();

export const useSemanticStore = create<SemanticState>()((set, get) => ({
  status: 'off',
  progress: 0,
  error: '',
  loadedId: null,
  stored: [],
  previews: {},
  preview: (chatId, sources, messages, draft) => {
    if (get().status !== 'ready') return;
    const key = previewKey(sources, messages, draft);
    if (get().previews[chatId]?.key === key || computing.get(chatId) === key) return;
    computing.set(chatId, key);
    const done = (hits: SemanticHits): void => {
      if (computing.get(chatId) !== key) return;
      computing.delete(chatId);
      set((state) => ({ previews: { ...state.previews, [chatId]: { key, hits } } }));
    };
    const scoring = semanticHitsOf(sources, messages, draft);
    if (scoring === null) done(NO_SEMANTIC_HITS);
    else void scoring.then(done);
  },
  setPreview: (chatId, hits) => {
    computing.delete(chatId);
    set((state) => ({ previews: { ...state.previews, [chatId]: { key: '', hits } } }));
  },
  load: async () => {
    const mine = (generation += 1);
    // 画面の言語の推奨か、設定で指定したモデル
    const model = semanticModelFor(activeLocale(), useSettingsStore.getState().embeddingModel);
    current = null;
    set({ status: 'loading', progress: 0, error: '', previews: {}, loadedId: null });
    const result = await embeddingPort().load(model, (progress) => {
      if (generation === mine) set({ progress });
    });
    if (generation !== mine) return;
    if (!result.ok) {
      set({ status: 'failed', error: result.message });
      return;
    }
    current = model;
    generic = result.generic;
    passages.clear();
    computing.clear();
    set({
      status: 'ready',
      progress: 1,
      previews: {},
      loadedId: model.id,
    });
    await get().refreshStored();
  },
  disable: async () => {
    generation += 1;
    current = null;
    generic = [];
    passages.clear();
    computing.clear();
    set({ status: 'off', progress: 0, error: '', previews: {}, loadedId: null });
    await embeddingPort().unload();
  },
  refreshStored: async () => {
    set({ stored: await embeddingPort().stored() });
  },
  remove: async (id) => {
    const settings = useSettingsStore.getState();
    const using = semanticModelFor(activeLocale(), settings.embeddingModel).id === id;
    if (get().loadedId === id || (settings.loreSemantic && using)) {
      settings.setLoreSemantic(false);
      await get().disable();
    }
    await embeddingPort().remove(id);
    await get().refreshStored();
  },
}));

const passageKey = (target: Pick<SemanticTarget, 'kind' | 'text'>): string =>
  `${target.kind}:${target.text}`;

/** 足りない文のベクトルを、埋め込み方ごとに計算して覚える。失敗したら false */
async function rememberPassages(targets: readonly SemanticTarget[]): Promise<boolean> {
  for (const kind of ['query', 'passage'] as const) {
    const texts = targets.filter((target) => target.kind === kind).map((target) => target.text);
    const missing = [...new Set(texts)].filter((text) => !passages.has(passageKey({ kind, text })));
    if (missing.length === 0) continue;
    const vectors = await embeddingPort().embed(missing, kind);
    if (vectors === null || vectors.length !== missing.length) return false;
    missing.forEach((text, index) => {
      const vector = vectors[index];
      if (vector === undefined) return;
      passages.set(passageKey({ kind, text }), { vector, baseline: baselineOf(vector, generic) });
    });
  }
  return true;
}

/**
 * 近似判定の当たり（送るときだけ呼ぶ）。有効でない・読めていない・対象が無いときは null を
 * すぐ返す（待たずに送る）。失敗したときは当たりなし（キーだけで当てる）
 */
export function semanticHitsOf(
  sources: readonly LoreSource[],
  messages: readonly ChatMessage[],
  draft = '',
): Promise<SemanticHits> | null {
  if (!useSettingsStore.getState().loreSemantic) return null;
  if (useSemanticStore.getState().status !== 'ready') return null;
  const targets = semanticTargets(sources);
  const query = semanticQuery(messages, draft);
  if (targets.length === 0 || query.latest.length === 0) return null;
  return scoreTargets(targets, query);
}

/** 1 つの発言の文と比べた点 */
async function scoresFor(
  targets: readonly SemanticTarget[],
  text: string,
): Promise<SemanticScore[] | null> {
  const [queryVector] = (await embeddingPort().embed([text], 'query')) ?? [];
  if (queryVector === undefined) return null;
  return targets.flatMap((target) => {
    const passage = passages.get(passageKey(target));
    if (passage === undefined) return [];
    const score = similarity(queryVector, passage.vector) - passage.baseline;
    return [{ sourceId: target.sourceId, index: target.index, score }];
  });
}

/**
 * 今の発言と比べ、何も当たらなければ末尾 2 件をつないだ文で比べ直す
 */
async function scoreTargets(
  targets: readonly SemanticTarget[],
  query: SemanticQuery,
): Promise<SemanticHits> {
  try {
    if (!(await rememberPassages(targets))) return NO_SEMANTIC_HITS;
    const model = current;
    if (model === null) return NO_SEMANTIC_HITS;
    const latest = await scoresFor(targets, query.latest);
    if (latest === null) return NO_SEMANTIC_HITS;
    const hits = pickSemanticHits(latest, model.floor);
    if (hits.size > 0 || query.context.length === 0) return hits;
    const context = await scoresFor(targets, query.context);
    return context === null ? NO_SEMANTIC_HITS : pickSemanticHits(context, model.contextFloor);
  } catch (error) {
    console.error('[近似判定]', error);
    return NO_SEMANTIC_HITS;
  }
}
