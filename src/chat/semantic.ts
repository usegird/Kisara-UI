import { selectedCandidate } from '@/chat/edit';
import type { LoreEntry, LoreSource } from '@/chat/lore';
import type { ChatMessage } from '@/chat/types';
import type { EmbeddingKind } from '@/port/embedding-port';

const SEMANTIC_MARGIN = 0.02;

export const SEMANTIC_LIMIT = 3;

const QUERY_DEPTH = 2;

export type SemanticHits = ReadonlyMap<string, ReadonlySet<number>>;

export const NO_SEMANTIC_HITS: SemanticHits = new Map();

export interface SemanticTarget {
  readonly sourceId: string;
  readonly index: number;
  readonly text: string;
  readonly kind: EmbeddingKind;
}

function compareText(entry: LoreEntry): { readonly text: string; readonly kind: EmbeddingKind } {
  const condition = entry.secondaryKeys.join('、').trim();
  return condition.length > 0
    ? { text: condition, kind: 'query' }
    : { text: entry.content, kind: 'passage' };
}

export function semanticTargets(sources: readonly LoreSource[]): SemanticTarget[] {
  const seen = new Set<string>();
  return sources.flatMap((source) => {
    if (seen.has(source.id)) return [];
    seen.add(source.id);
    return source.entries.flatMap((entry: LoreEntry, index): SemanticTarget[] =>
      entry.logic === 'rag' && entry.enabled && !entry.constant && entry.content.trim().length > 0
        ? [{ sourceId: source.id, index, ...compareText(entry) }]
        : [],
    );
  });
}

export interface SemanticQuery {
  readonly latest: string;
  readonly context: string;
}

export function semanticQuery(messages: readonly ChatMessage[], draft = ''): SemanticQuery {
  const texts = [...messages.map((message) => selectedCandidate(message)?.content ?? ''), draft]
    .filter((content) => content.trim().length > 0)
    .slice(-QUERY_DEPTH);
  return {
    latest: texts.at(-1) ?? '',
    context: texts.length < QUERY_DEPTH ? '' : texts.join('\n'),
  };
}

export function similarity(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

export function baselineOf(passage: Float32Array, generic: readonly Float32Array[]): number {
  if (generic.length === 0) return 0;
  return generic.reduce((sum, vector) => sum + similarity(vector, passage), 0) / generic.length;
}

export interface SemanticScore {
  readonly sourceId: string;
  readonly index: number;
  readonly score: number;
}

export function pickSemanticHits(scores: readonly SemanticScore[], floor: number): SemanticHits {
  const best = Math.max(...scores.map((item) => item.score));
  const picked = scores
    .filter((item) => item.score >= floor && item.score >= best - SEMANTIC_MARGIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, SEMANTIC_LIMIT);
  const hits = new Map<string, Set<number>>();
  for (const item of picked) {
    const set = hits.get(item.sourceId) ?? new Set<number>();
    set.add(item.index);
    hits.set(item.sourceId, set);
  }
  return hits;
}
