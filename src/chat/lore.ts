import { selectedCandidate } from '@/chat/edit';
import { applyMacros, type PromptSources } from '@/chat/macros';
import type { SemanticHits } from '@/chat/semantic';
import { estimateText } from '@/chat/tokens';
import type {
  ChatMessage,
  LoreFraming,
  PromptComposition,
  PromptItem,
  PromptRole,
} from '@/chat/types';

// ─────────────────────────────
// ロアの形と、当て方・合わせ方・包み方。送るたびに送る時点の会話から当て直し、当たった結果は残さない
// （並べるのは組み立てが受け持つ）。外の形からの読み取りは world-info.ts
// ─────────────────────────────

/** 百分率の換算（発動率は 0〜100 で持つ） */
const PERCENT = 100;

/**
 * 辞書のトリガー検索範囲の既定。今回のメッセージの前の、会話の履歴の発言の件数（role を問わない）で、
 * 今回のメッセージはいつも加えて見る。項目の見る範囲があればそちら（今回のメッセージを含めた件数）
 */
export const DEFAULT_SCAN_DEPTH = 2;

/** 予算に使う文脈長の割合 */
const BUDGET_RATIO = 0.25;

/** 包まない（構成が前置き・後置きを持たないとき） */
export const NO_FRAMING: LoreFraming = { prefix: '', suffix: '' };

/**
 * カードの辞書を入れるときの id
 */
const FIRST_LOREBOOK_ID = 'lorebook-1';

/**
 * 第 2 のキーの当て方。OR: どれか、AND: すべて、NOR: どれも出ない、NAND: すべては出ていない。
 * `rag` は第 2 のキーを使わず、会話との意味の近さで当てる（近似判定）
 */
export type LoreLogic = 'or' | 'and' | 'nor' | 'nand' | 'rag';

/**
 * ロアブックの 1 項目
 */
export interface LoreEntry {
  readonly keys: readonly string[];
  /** 第 2 のキー。`selective` が偽なら空（使わない） */
  readonly secondaryKeys: readonly string[];
  /** 第 2 のキーの当て方 */
  readonly logic: LoreLogic;
  /** 当たった項目を送る確率（0〜100）。100 ならいつも送る */
  readonly probability: number;
  readonly caseSensitive: boolean;
  readonly content: string;
  readonly enabled: boolean;
  /** キーと無関係に常に入れる */
  readonly constant: boolean;
  /** World Info (before) / (after) のどちらに入るか。深さの項目は画面では後ろに数える */
  readonly side: 'before' | 'after';
  /** 深さ N に差し込むなら、その深さと role。World Info の印に入るなら null */
  readonly depth: { readonly depth: number; readonly role: PromptRole } | null;
  /** 真なら会話履歴の先頭に `system` で差し込む（深さは使わない。取り込んだ項目は偽） */
  readonly historyStart: boolean;
  /**
   * 会話の履歴の末尾から見る件数。null なら既定の件数
   */
  readonly scanDepth: number | null;
  /** 同じ置き場の中で小さい方を先に置く */
  readonly order: number;
  /** 予算を超えたとき、小さい方から外す */
  readonly priority: number;
  readonly comment: string;
}

/**
 * 個別追加辞書。カードのロアブックと Character's Note を、会話とプリセットがそれぞれ
 * 中に持つ。名前は無ければ空
 */
export interface Lorebook {
  readonly name: string;
  readonly entries: readonly LoreEntry[];
  /**
   * トリガー検索範囲（会話履歴の末尾から見る発言の件数）。無ければ既定
   */
  readonly scanDepth?: number | undefined;
}

/**
 * 会話・プリセットが持つ個別追加辞書の 1 冊（何冊でも持てる）。id は並びの中で冊を見分ける。
 * `off` はこの会話で当てない印（会話だけが持つ。プリセットには書かない）
 */
export interface OwnLorebook extends Lorebook {
  readonly id: string;
  readonly off?: true | undefined;
}

/** 予算（トークン）。文脈長が分からなければ 0（上限なし） */
export function loreBudget(context: number | null): number {
  return context === null || context <= 0 ? 0 : Math.floor(context * BUDGET_RATIO);
}

/** 当てる条件。予算が 0 なら上限なし */
export interface LoreOptions {
  readonly budget: number;
  readonly framing: LoreFraming;
  /**
   * 発動率を振る数（0 以上 1 未満）。送るときだけ渡す。無ければ振らず、当たったものとする
   * （プロンプトのタブの見込み）
   */
  readonly roll?: (() => number) | undefined;
  /**
   * 近似判定で当たった項目（送るときだけ。無ければキーだけで当てる）
   */
  readonly semantic?: SemanticHits | undefined;
}

/**
 * 当てる出どころ 1 つ（追加辞書 1 冊）。並びの順が出どころの順
 */
export interface LoreSource {
  readonly id: string;
  readonly entries: readonly LoreEntry[];
  /**
   * 予算に収めるとき、ほかの出どころより先に足す（プリセットのロアブック）
   */
  readonly budgetFirst?: boolean | undefined;
  /** 辞書のトリガー検索範囲（今回のメッセージの前の履歴の件数）。無ければ既定（DEFAULT_SCAN_DEPTH） */
  readonly scanDepth?: number | undefined;
}

/** 当てた結果。追加辞書の印の本文と、深さに差し込む項目と、出どころごとの当たった項目の位置 */
export interface LoreResult {
  /** 追加辞書の印の本文（深さを持たない項目。前の項目を先に並べる） */
  readonly additional: string;
  readonly depthItems: readonly PromptItem[];
  /** 送る項目の、出どころ（id）ごとの項目の位置 */
  readonly hits: ReadonlyMap<string, ReadonlySet<number>>;
}

/** 何も当てない結果（出どころが無いとき） */
const NO_LORE: LoreResult = { additional: '', depthItems: [], hits: new Map() };

/** 深さの項目の順の値（Character's Note と同じ） */
const DEPTH_ORDER = 100;

/** 本文のある発言（選んでいる候補）。古い順 */
function spokenTexts(messages: readonly ChatMessage[]): string[] {
  return messages
    .map((message) => selectedCandidate(message)?.content ?? '')
    .filter((content) => content.length > 0);
}

function matchesAny(
  keys: readonly string[],
  target: string,
  entry: LoreEntry,
  macro: (text: string) => string,
): boolean {
  const haystack = entry.caseSensitive ? target : target.toLowerCase();
  return keys.some((raw) => {
    const key = macro(raw).trim();
    if (key.length === 0) return false;
    return haystack.includes(entry.caseSensitive ? key : key.toLowerCase());
  });
}

/**
 * 当てる。見る範囲は項目ごと（無ければ `scanDepth`。どちらも今回の
 * メッセージを含めた末尾からの件数）。
 * `near` は近似判定で当たったか（RAG の項目はキーを使わず、これだけで当てる）
 */
function isActive(
  entry: LoreEntry,
  spoken: readonly string[],
  macro: (text: string) => string,
  scan: { readonly near: boolean; readonly scanDepth: number },
): boolean {
  if (!entry.enabled || entry.content.trim().length === 0) return false;
  if (entry.constant) return true;
  if (entry.logic === 'rag') return scan.near;
  const depth = entry.scanDepth ?? scan.scanDepth;
  const target = depth <= 0 ? '' : spoken.slice(-depth).join('\n');
  if (!matchesAny(entry.keys, target, entry, macro)) return false;
  return passesCondition(entry, target, macro);
}

/** 第 2 のキーを追加条件の論理で当てる。第 2 のキーが無ければ通す */
function passesCondition(
  entry: LoreEntry,
  target: string,
  macro: (text: string) => string,
): boolean {
  if (entry.secondaryKeys.length === 0) return true;
  const hit = (key: string): boolean => matchesAny([key], target, entry, macro);
  switch (entry.logic) {
    case 'or':
      return entry.secondaryKeys.some(hit);
    case 'and':
      return entry.secondaryKeys.every(hit);
    case 'nor':
      return !entry.secondaryKeys.some(hit);
    case 'nand':
      return !entry.secondaryKeys.every(hit);
    case 'rag':
      return true;
  }
}

/** 発動率を振る。振る数が無いか 100 なら通す */
function passesProbability(entry: LoreEntry, roll: (() => number) | undefined): boolean {
  if (roll === undefined || entry.probability >= PERCENT) return true;
  return roll() * PERCENT < entry.probability;
}

/** 当たった 1 項目と、その出どころの順・出どころの中の位置 */
interface Hit {
  readonly entry: LoreEntry;
  readonly source: number;
  readonly index: number;
  /** 予算に収めるとき先に足すか */
  readonly first: boolean;
}

/**
 * 予算に収める。先に足す出どころ（個別追加辞書）、その後は
 * 出どころの順、その中は優先の高い順に足し、超える項目は外す
 */
function withinBudget(active: readonly Hit[], budget: number): Hit[] {
  if (budget <= 0) return [...active];
  const ordered = [...active].sort(
    (a, b) =>
      Number(b.first) - Number(a.first) ||
      a.source - b.source ||
      b.entry.priority - a.entry.priority ||
      a.index - b.index,
  );
  const kept: Hit[] = [];
  let used = 0;
  for (const item of ordered) {
    const cost = estimateText(item.entry.content);
    if (used + cost > budget) continue;
    used += cost;
    kept.push(item);
  }
  return kept;
}

/**
 * 前置き・本文・後置きを空行でつなぐ。本文が無ければ空
 */
function wrap(contents: readonly string[], framing: LoreFraming): string {
  if (contents.length === 0) return '';
  return [framing.prefix, ...contents, framing.suffix]
    .filter((part) => part.trim().length > 0)
    .join('\n\n');
}

/** 同じ id の出どころは最初の 1 つだけ使う（同じ辞書を 2 回置かない） */
function distinctSources(sources: readonly LoreSource[]): LoreSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}

/**
 * 会話履歴へ差し込む深さと role。追加辞書の印に入る項目は null。履歴先頭は `historyCount`
 * （送る発言の数）の深さにして、最初の発言の前に入れる
 */
export function loreInsertion(
  entry: LoreEntry,
  historyCount: number,
): { readonly depth: number; readonly role: PromptRole } | null {
  return entry.historyStart ? { depth: historyCount, role: 'system' } : entry.depth;
}

/**
 * 出どころを当てる。`macro` は `{{char}}`・`{{user}}` の置き換え（キーに掛ける）。
 * 本文と包みの置き換えは組み立てが掛ける
 */
export function activateLore(
  sources: readonly LoreSource[],
  messages: readonly ChatMessage[],
  options: LoreOptions,
  macro: (text: string) => string,
): LoreResult {
  const spoken = spokenTexts(messages);
  const distinct = distinctSources(sources);
  const active = distinct.flatMap((source, sourceIndex) =>
    source.entries.flatMap((entry, index): Hit[] =>
      isActive(entry, spoken, macro, {
        near: options.semantic?.get(source.id)?.has(index) === true,
        // 履歴の件数に今回のメッセージの 1 件を足す
        scanDepth: (source.scanDepth ?? DEFAULT_SCAN_DEPTH) + 1,
      }) && passesProbability(entry, options.roll)
        ? [{ entry, source: sourceIndex, index, first: source.budgetFirst === true }]
        : [],
    ),
  );
  // 出どころの順、その中は前の項目を先に、その中は順の値で並べる
  const sideRank = (entry: LoreEntry): number => (entry.side === 'before' ? 0 : 1);
  const kept = withinBudget(active, options.budget).sort(
    (a, b) =>
      a.source - b.source ||
      sideRank(a.entry) - sideRank(b.entry) ||
      a.entry.order - b.entry.order ||
      a.index - b.index,
  );

  // 送る発言の数（今回のメッセージを含む）。履歴先頭の深さに使う
  const historyCount = messages.length + 1;
  const additional = wrap(
    kept
      .filter(({ entry }) => loreInsertion(entry, historyCount) === null)
      .map(({ entry }) => entry.content),
    options.framing,
  );
  const groups = new Map<string, { depth: number; role: PromptRole; contents: string[] }>();
  for (const { entry } of kept) {
    const insertion = loreInsertion(entry, historyCount);
    if (insertion === null) continue;
    const key = `${insertion.depth}:${insertion.role}`;
    const group = groups.get(key) ?? { ...insertion, contents: [] };
    group.contents.push(entry.content);
    groups.set(key, group);
  }
  const depthItems = [...groups].map(([key, group]): PromptItem => ({
    id: `:lore:${key}`,
    name: '',
    role: group.role,
    marker: null,
    content: wrap(group.contents, options.framing),
    enabled: true,
    position: { kind: 'depth', depth: group.depth, order: DEPTH_ORDER },
  }));
  const hits = new Map<string, Set<number>>();
  for (const { source, index } of kept) {
    const id = distinct[source]?.id;
    if (id === undefined) continue;
    const set = hits.get(id) ?? new Set<number>();
    set.add(index);
    hits.set(id, set);
  }
  return { additional, depthItems, hits };
}

/** ロアを当てる相手の発言と、当て方の材料 */
export interface LoreScan {
  readonly messages: readonly ChatMessage[];
  /** 会話のモデルの文脈長（分からなければ null） */
  readonly context: number | null;
  /** 発動率を振る。送るときだけ渡す */
  readonly roll?: (() => number) | undefined;
  /** 近似判定の当たり。送るときだけ渡す */
  readonly semantic?: SemanticHits | undefined;
}

/**
 * 会話のロアを当てる。予算は文脈長から決め、包み方は構成が持つ。
 * キーの置き換えは `{{char}}`・`{{user}}` と変数
 */
export function chatLore(
  sources: readonly LoreSource[],
  composition: PromptComposition,
  names: Pick<PromptSources, 'userName' | 'charName' | 'variables'>,
  { messages, context, roll, semantic }: LoreScan,
): LoreResult {
  if (sources.length === 0) return NO_LORE;
  const macroSources: PromptSources = { ...names, markerText: () => '' };
  const options: LoreOptions = {
    budget: loreBudget(context),
    framing: composition.loreFraming ?? NO_FRAMING,
    roll,
    semantic,
  };
  return activateLore(sources, messages, options, (text) => applyMacros(text, macroSources));
}

/** 送る中身の出どころに、当てたロアを足す（追加辞書の印の本文と、深さの項目） */
export function withLore(base: PromptSources, lore: LoreResult): PromptSources {
  return {
    ...base,
    markerText: (marker) =>
      marker === 'additionalInfo' ? lore.additional : base.markerText(marker),
    extraItems: [...(base.extraItems ?? []), ...lore.depthItems],
  };
}

// ─────────────────────────────
// 個別追加辞書の並び
// ─────────────────────────────

/** カードの辞書 1 冊を並びにする。無ければ空 */
export function lorebookList(book: Lorebook | null): OwnLorebook[] {
  if (book === null) return [];
  return [{ id: FIRST_LOREBOOK_ID, ...book }];
}

/** 並びのすべての項目（カードの欄の見え方に渡す。切った辞書も含める） */
export function lorebookEntries(books: readonly OwnLorebook[]): LoreEntry[] {
  return books.flatMap((book) => book.entries);
}

/** プリセットに書く並び（会話で切った印は書かない） */
export function savedLorebooks(books: readonly OwnLorebook[]): OwnLorebook[] {
  return books.map(({ id, name, entries, scanDepth }) => ({
    id,
    name,
    entries,
    ...(scanDepth === undefined ? {} : { scanDepth }),
  }));
}
