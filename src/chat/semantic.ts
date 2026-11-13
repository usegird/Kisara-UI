import { selectedCandidate } from '@/chat/edit';
import type { LoreEntry, LoreSource } from '@/chat/lore';
import type { ChatMessage } from '@/chat/types';
import type { EmbeddingKind } from '@/port/embedding-port';

// ─────────────────────────────
// 近似判定の比べる物を選び、点から当たりを決める純関数。埋め込みの計算は窓口が受け持つ。
// 下限はモデルごと（semantic-models）、幅と数はここに置く。
// ─────────────────────────────

/** 最高点からこの幅の中だけを当たりとする */
const SEMANTIC_MARGIN = 0.02;

/** 当てる項目の数の上限（出どころをまたいで） */
export const SEMANTIC_LIMIT = 3;

/**
 * 比べる発言の件数（既定の見る範囲と同じ）
 */
const QUERY_DEPTH = 2;

/** 近似判定の当たり。出どころ（id）ごとの項目の位置（LoreResult.hits と同じ形） */
export type SemanticHits = ReadonlyMap<string, ReadonlySet<number>>;

/** 当たりなし（読めていない・失敗したとき） */
export const NO_SEMANTIC_HITS: SemanticHits = new Map();

/** 近似判定で比べる 1 項目。比べる文と、その埋め込み方 */
export interface SemanticTarget {
  readonly sourceId: string;
  readonly index: number;
  readonly text: string;
  readonly kind: EmbeddingKind;
}

/**
 * 比べる文。追加条件の文（場面を書いた文）があれば問いとして、無ければ追加内容を文書として埋め込む
 */
function compareText(entry: LoreEntry): { readonly text: string; readonly kind: EmbeddingKind } {
  const condition = entry.secondaryKeys.join('、').trim();
  return condition.length > 0
    ? { text: condition, kind: 'query' }
    : { text: entry.content, kind: 'passage' };
}

/** 近似判定の対象。追加条件の論理が RAG で、有効・本文があり・常時でない項目。同じ id の出どころは最初だけ */
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

/**
 * 比べる発言。今の発言と、末尾 2 件をつないだ文（2 件そろわなければ空）
 */
export interface SemanticQuery {
  readonly latest: string;
  readonly context: string;
}

/**
 * 比べる発言。`draft` は送る前のメッセージ（プロンプトのタブの見込みで、打ちかけの本文を最後の発言と
 * して数える）。本文は選んでいる候補。空の発言は数えない
 */
export function semanticQuery(messages: readonly ChatMessage[], draft = ''): SemanticQuery {
  const texts = [...messages.map((message) => selectedCandidate(message)?.content ?? ''), draft]
    .filter((content) => content.trim().length > 0)
    .slice(-QUERY_DEPTH);
  return {
    latest: texts.at(-1) ?? '',
    context: texts.length < QUERY_DEPTH ? '' : texts.join('\n'),
  };
}

/** 長さ 1 にそろえたベクトルどうしの近さ（cos） */
export function similarity(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/** 項目のふだんの近さ。ありふれた発言のベクトルとの近さの平均 */
export function baselineOf(passage: Float32Array, generic: readonly Float32Array[]): number {
  if (generic.length === 0) return 0;
  return generic.reduce((sum, vector) => sum + similarity(vector, passage), 0) / generic.length;
}

/** 点の付いた 1 項目 */
export interface SemanticScore {
  readonly sourceId: string;
  readonly index: number;
  readonly score: number;
}

/** 点から当たりを決める。下限以上で、最高点から幅の中のものを、点の高い順に上限まで */
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
