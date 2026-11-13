import type { LoreEntry } from '@/chat/lore';
import { PERCENT } from '@/components/ui/units';
import { t } from '@/i18n';
import { entryKeyOf } from '@/lib/text-entry';

// ─────────────────────────────
// 追加辞書の 1 項目の欄の決まり（追加先・位置・発動率・トリガーワードの読み書き）。
// ─────────────────────────────

/** 常に入れるを表すトリガーワード */
export const ALWAYS = '*';

/**
 * 追加先（項目の置き場）。追加辞書の印・会話履歴の先頭・深さ
 */
export type Place = 'dictionary' | 'historyStart' | 'historyEnd';

/** 深さを持たない項目を深さに替えるときの既定（作者のメモの既定の深さと同じ） */
const DEFAULT_DEPTH = { depth: 4, role: 'system' } as const;

/** 項目の追加先 */
export function placeOf(entry: LoreEntry): Place {
  if (entry.historyStart) return 'historyStart';
  return entry.depth === null ? 'dictionary' : 'historyEnd';
}

/** 追加先を替えた項目。深さへ替えるときは既定の深さを入れる */
export function withPlace(entry: LoreEntry, place: Place): LoreEntry {
  if (place === 'historyEnd') {
    return { ...entry, historyStart: false, depth: entry.depth ?? DEFAULT_DEPTH };
  }
  return { ...entry, historyStart: place === 'historyStart', depth: null };
}

/** 追加先の選択の値か */
export function isPlace(value: string): value is Place {
  return value === 'dictionary' || value === 'historyStart' || value === 'historyEnd';
}

/** 位置の欄の文字。末尾を 0 として前へ数えた件数を負の数で出す */
export function formatPosition(depth: number): string {
  return depth === 0 ? '0' : `-${depth}`;
}

/** 位置の欄から深さに直す。正の数も前へ数えた件数とみなす。空や読めないものは 0 */
export function depthOf(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? Math.abs(value) : 0;
}

/** 発動率の欄から 0〜100 の整数に直す。空や読めないものは 100 */
export function probabilityOf(text: string): number {
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? Math.min(PERCENT, Math.max(0, value)) : PERCENT;
}

/** トリガーワードの欄の文字。常に入れる項目は先頭に「*」を出す */
export function formatTriggers(entry: LoreEntry): string {
  return (entry.constant ? [ALWAYS, ...entry.keys] : entry.keys).join(', ');
}

/** 並べ替えの読み上げの名前 */
export function entryName(entry: LoreEntry): string {
  const text = formatTriggers(entry);
  return text.length === 0 ? t('llm.dictionary.noKeys') : text;
}

/** 1 行の欄の Enter で決め、Escape で打ちかけを戻す（ダイアログは閉じない） */
export function lineKeys(
  commit: () => void,
  reset: () => void,
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent): void => {
    const key = entryKeyOf(event);
    if (key === 'commit') commit();
    if (key === 'cancel') {
      event.stopPropagation();
      reset();
    }
  };
}

/** 意味で当てる条件の文。空なら条件なし */
export function sentenceList(sentence: string): string[] {
  return sentence.length === 0 ? [] : [sentence];
}
