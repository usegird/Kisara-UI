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

export type SemanticStatus = 'off' | 'loading' | 'ready' | 'failed';

interface SemanticPreview {
  readonly key: string;
  readonly hits: SemanticHits;
}

interface SemanticState {
  readonly status: SemanticStatus;
  readonly progress: number;
  readonly error: string;
  readonly loadedId: string | null;
  readonly stored: readonly StoredEmbeddingModel[];
  readonly previews: Readonly<Record<string, SemanticPreview>>;
  readonly preview: (
    chatId: string,
    sources: readonly LoreSource[],
    messages: readonly ChatMessage[],
    draft: string,
  ) => void;
  readonly setPreview: (chatId: string, hits: SemanticHits) => void;
  readonly load: () => Promise<void>;
  readonly disable: () => Promise<void>;
  readonly refreshStored: () => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
}

let current: SemanticModel | null = null;

let generic: readonly Float32Array[] = [];

const passages = new Map<string, { readonly vector: Float32Array; readonly baseline: number }>();

let generation = 0;

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

export async function nearestLabelOf(
  text: string,
  labels: readonly string[],
): Promise<string | null> {
  if (!useSettingsStore.getState().loreSemantic) return null;
  if (useSemanticStore.getState().status !== 'ready') return null;
  if (labels.length === 0 || text.trim().length === 0) return null;
  const targets = labels.map(
    (label, index): SemanticTarget => ({ sourceId: '', index, text: label, kind: 'passage' }),
  );
  try {
    if (!(await rememberPassages(targets))) return null;
    const scores = await scoresFor(targets, text);
    if (scores === null || scores.length === 0) return null;
    const best = scores.reduce((top, item) => (item.score > top.score ? item : top));
    return labels[best.index] ?? null;
  } catch (error) {
    console.error('[近似判定]', error);
    return null;
  }
}
