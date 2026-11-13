import type { Dictionary } from '@/chat/dictionary';
import type { LoreEntry } from '@/chat/lore';
import { loreInsertion } from '@/chat/lore';
import type { PromptRole } from '@/chat/types';
import { LATIN1_LAST } from '@/components/ui/units';

// ─────────────────────────────
// プロンプトのタブの追加辞書の行を、送る順に組み立てる。部品と別のファイルに置く
// （部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/** 一覧の 1 行 */
export type AdditionalInfoRow =
  | {
      readonly kind: 'entry';
      readonly key: string;
      readonly dictionary: string;
      readonly entry: LoreEntry;
      readonly role: PromptRole;
    }
  | { readonly kind: 'history'; readonly key: string; readonly count: number }
  /** 今回のメッセージの位置（その後ろに差し込む項目があるときだけ） */
  | { readonly kind: 'message'; readonly key: string };

/** 追加辞書の行を組み立てるのに使う、辞書と当てた結果 */
export interface AdditionalInfoInput {
  /**
   * 会話の個別追加辞書のうち当てる冊（出どころの id・行に出す名前・項目の列）。並びの順。
   * 全体で有効にした辞書の後に並ぶ
   */
  readonly own: readonly Dictionary[];
  readonly dictionaries: Readonly<Record<string, Dictionary>>;
  /** 全体で有効にした辞書の id（有効にした順） */
  readonly enabledIds: readonly string[];
  /** 送るときと同じ条件で当てた結果（出どころの id ごとの、当たった項目の位置） */
  readonly hits: ReadonlyMap<string, ReadonlySet<number>>;
  /** 送る発言の件数（今回のメッセージを含める） */
  readonly historyCount: number;
}

interface Placed {
  readonly dictionary: Dictionary;
  readonly entry: LoreEntry;
  readonly index: number;
  readonly source: number;
}

/** 出す項目。今の会話で当たっている項目だけ */
function placedEntries(input: AdditionalInfoInput): Placed[] {
  const placed: Placed[] = [];
  const add = (dictionary: Dictionary, source: number): void => {
    const hits = input.hits.get(dictionary.id);
    dictionary.entries.forEach((entry, index) => {
      if (hits?.has(index) === true) placed.push({ dictionary, entry, index, source });
    });
  };
  input.enabledIds.forEach((id, order) => {
    const dictionary = input.dictionaries[id];
    if (dictionary !== undefined) add(dictionary, order);
  });
  input.own.forEach((dictionary, order) => add(dictionary, input.enabledIds.length + order));
  return placed;
}

const sideRank = (entry: LoreEntry): number => (entry.side === 'before' ? 0 : 1);

function entryRow(item: Placed): AdditionalInfoRow {
  return {
    kind: 'entry',
    key: `${item.dictionary.id}:${item.index}`,
    dictionary: item.dictionary.name,
    entry: item.entry,
    role: item.entry.depth?.role ?? 'system',
  };
}

/** 追加辞書の一覧の行と、会話履歴を開いた中の行 */
interface LoreRows {
  /** 追加辞書の印に入る項目 */
  readonly additional: readonly AdditionalInfoRow[];
  /** 「履歴 N 件」と、履歴の中へ差し込む項目（深い方が先） */
  readonly history: readonly AdditionalInfoRow[];
}

/**
 * 追加辞書の印に入る項目は追加辞書の一覧の行に、履歴の中へ差し込む項目は会話履歴を開いた中の行に分ける。
 * 差し込む位置は「履歴 N 件」の行で表す
 */
export function loreRows(input: AdditionalInfoInput): LoreRows {
  const additional: AdditionalInfoRow[] = [];
  const placed = placedEntries(input);
  const total = input.historyCount;
  const insertion = (item: Placed) => loreInsertion(item.entry, total);
  const anchored = placed
    .filter((item) => insertion(item) === null)
    .sort(
      (a, b) =>
        a.source - b.source ||
        sideRank(a.entry) - sideRank(b.entry) ||
        a.entry.order - b.entry.order ||
        a.index - b.index,
    );
  additional.push(...anchored.map(entryRow));

  // 履歴より深い項目と履歴先頭の項目は履歴の先頭に入る（送る中身の組み立てと同じ）
  const depthOf = (item: Placed): number => Math.min(insertion(item)?.depth ?? 0, total);
  const inserted = placed
    .filter((item) => insertion(item) !== null)
    .sort(
      (a, b) =>
        depthOf(b) - depthOf(a) ||
        a.source - b.source ||
        a.entry.order - b.entry.order ||
        a.index - b.index,
    );
  const history: AdditionalInfoRow[] = [];
  // 末尾から数えた位置 `from` から `to` までの発言を出す。末尾の 1 件は今回のメッセージなので、
  // そこを含むときは履歴の件数から外し、後ろに項目が続くならメッセージの行を置く
  const span = (from: number, to: number, followed: boolean): void => {
    const withMessage = to === 0 && from > 0;
    const count = from - to - (withMessage ? 1 : 0);
    if (count > 0) history.push({ kind: 'history', key: `:history:${from}`, count });
    if (withMessage && followed) history.push({ kind: 'message', key: ':message' });
  };
  let remaining = total;
  for (const item of inserted) {
    span(remaining, depthOf(item), true);
    remaining = depthOf(item);
    history.push(entryRow(item));
  }
  span(remaining, 0, false);
  return { additional, history };
}

/** 辞書名の幅の上限（半角で数える。全角は 2） */
const NAME_WIDTH = 10;

/** 半角で数えた幅に収める。超えた分は「…」にする（「…」も幅に入れる） */
export function clipWidth(text: string, width: number = NAME_WIDTH): string {
  const chars = [...text];
  const widthOf = (char: string): number => ((char.codePointAt(0) ?? 0) > LATIN1_LAST ? 2 : 1);
  const total = chars.reduce((sum, char) => sum + widthOf(char), 0);
  if (total <= width) return text;
  let used = 0;
  let out = '';
  for (const char of chars) {
    if (used + widthOf(char) > width - 1) break;
    used += widthOf(char);
    out += char;
  }
  return `${out}…`;
}
