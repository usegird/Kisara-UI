import { PLAYBOOK_ID, PREFILL_ID } from '@/chat/assemble';
import type { AdvisorChange, AdvisorCharacterField } from '@/chat/prompt-advisor';
import { MAIN_PROMPT_ID, type PromptComposition, type PromptMarker } from '@/chat/types';

// ─────────────────────────────
// 構成の相談の案を当てたときに、プロンプトのタブで開く行を決める。
// ─────────────────────────────

/** カードの欄と、それを送る印 */
export const FIELD_MARKER: Readonly<Partial<Record<AdvisorCharacterField, PromptMarker>>> = {
  description: 'charDescription',
  personality: 'charPersonality',
  scenario: 'scenario',
  mesExample: 'dialogueExamples',
};

/** 個別追加辞書の項目を足したときに開く行（追加辞書の印の項目）を指す仮の印 */
const ADDITIONAL_INFO_ROW = ':additional-info';

/** 個別追加辞書の項目を足したときに開く行。段ならプレイブックの行、ほかは追加辞書の印の項目 */
export function entryRowOf(dictionary: string, outline: string | null): string {
  return dictionary === outline ? PLAYBOOK_ID : ADDITIONAL_INFO_ROW;
}

/** 構成の項目への変える所で開く行。足した項目は id を作るときに控える */
export function rowsOfChange(
  change: Exclude<AdvisorChange, { target: 'character' | 'dictionaryEntry' }>,
): string[] {
  switch (change.target) {
    case 'main':
      return [MAIN_PROMPT_ID];
    case 'item':
      return [change.id];
    case 'prefill':
      return [PREFILL_ID];
    case 'newItem':
    case 'removeItem':
      return [];
  }
}

/**
 * 開く行を、当てた後の構成の id にそろえる。カードの欄は送る印の項目、個別追加辞書は追加辞書の印の
 * 項目を開く（構成に無ければ開かない）
 */
export function changedRowsOf(
  prompt: PromptComposition,
  rows: ReadonlySet<string>,
  fields: readonly AdvisorCharacterField[],
): string[] {
  const markerRow = (marker: PromptMarker): string[] =>
    prompt.items.filter((item) => item.marker === marker).map((item) => item.id);
  const fieldRows = fields.flatMap((field) => {
    const marker = FIELD_MARKER[field];
    return marker === undefined ? [] : markerRow(marker);
  });
  const named = [...rows].flatMap((row) =>
    row === ADDITIONAL_INFO_ROW ? markerRow('additionalInfo') : [row],
  );
  return [...new Set([...named, ...fieldRows])];
}
