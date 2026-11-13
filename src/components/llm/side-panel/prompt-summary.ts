import {
  cardFieldOf,
  cardFieldValue,
  cardMarkerText,
  characterView,
  markerHasContent,
  type CardView,
} from '@/chat/card';
import type { characterOf, chatLorebooks } from '@/chat/chat-sources';
import { lorebookDictionary } from '@/chat/dictionary';
import { lorebookEntries } from '@/chat/lore';
import { applyMacros, type PromptSources } from '@/chat/macros';
import type { ChatPlaybook } from '@/chat/playbook';
import { currentPhase } from '@/chat/playbook-outline';
import { playbookText } from '@/chat/playbook-text';
import { isAnchorItem, isFixedItem } from '@/chat/prompt';
import { estimateMessage, replyReserveOf } from '@/chat/tokens';
import type { Chat, PromptItem } from '@/chat/types';
import type { PlaybookPromptRow } from '@/components/llm/playbook/PlaybookPromptCard';
import { loreRows, type AdditionalInfoInput } from '@/components/llm/prompt/additional-info-rows';
import type { ItemSummary } from '@/components/llm/prompt/PromptItemList';
import { t } from '@/i18n';
import type { usePresetsStore } from '@/store/use-presets-store';
import type { toChatTools } from '@/store/use-workflow-tools-store';

// ─────────────────────────────
// 会話の右の列のプロンプトのタブの行の組み立て。項目の補足・開いて直すもの・見積もりの上限と内訳・
// プレイブックの行を、会話と見積もりから導く（描かない）。
// ─────────────────────────────

/** 補足の無い項目の既定（出どころ・注記・ロア・欄） */
export const NONE: Pick<ItemSummary, 'source' | 'note' | 'lore' | 'card'> = {
  source: '',
  note: '',
  lore: [],
  card: null,
};

/**
 * 追加辞書の当たりと、会話履歴の件数（そのまま送る・除外する）
 */
export interface HistoryInput extends AdditionalInfoInput {
  readonly counts: { readonly kept: number; readonly dropped: number };
}

/** 名前の右に出す補足（本文の頭・出どころ）と、開いたときに直すもの */
export function summaryOf(
  chat: Chat,
  item: PromptItem,
  view: CardView | null,
  lore: HistoryInput,
): ItemSummary {
  const card = cardEditOf(chat, item, view);
  if (card !== null) {
    const head = headOf(card.value);
    return { ...NONE, text: head, empty: head.length === 0, card };
  }
  switch (item.marker) {
    case null: {
      const head = headOf(item.content);
      return { ...NONE, text: head, empty: head.length === 0 };
    }
    case 'chatHistory': {
      const { kept, dropped } = lore.counts;
      const text = t('llm.prompt.source.history', { kept, dropped });
      const empty = chat.messages.length === 0;
      return { ...NONE, text, empty, lore: loreRows(lore).history };
    }
    case 'currentInput':
      return { ...NONE, text: '', empty: true };
    case 'personaDescription': {
      const persona = chat.persona;
      const head = persona === null ? '' : headOf(persona.description || persona.name);
      return { ...NONE, text: head, empty: head.length === 0 };
    }
    case 'additionalInfo': {
      const rows = loreRows(lore).additional;
      const hits = rows.filter((row) => row.kind === 'entry').length;
      const text = hits === 0 ? '' : t('llm.prompt.lore.hits', { count: hits });
      return { ...NONE, text, empty: hits === 0, lore: rows };
    }
    default: {
      if (view === null) {
        const note = t('llm.prompt.notes.noPreset');
        return { ...NONE, text: t('llm.prompt.source.noPreset'), empty: true, note };
      }
      const source = cardMarkerText(view, item.marker);
      const head = headOf(source);
      return { ...NONE, text: head, empty: head.length === 0, source };
    }
  }
}

/** 追加辞書の印の項目か（動的追加辞書を切っているときは出さない） */
export function isAdditionalInfo(item: PromptItem): boolean {
  return item.marker === 'additionalInfo';
}

/** 会話の写しの欄を、辞書を添えて見る形にする。キャラクターカードの欄が無ければ null */
export function characterViewOf(
  fields: ReturnType<typeof characterOf>,
  books: ReturnType<typeof chatLorebooks>,
): ReturnType<typeof characterView> | null {
  return fields === null ? null : characterView(fields, lorebookEntries(books));
}

/** 中身のある項目か。目印の項目は、カードが無ければ固定の項目と差し込みの位置だけを数える */
export function isFilledItem(
  item: PromptItem,
  card: ReturnType<typeof characterView> | null,
  persona: Chat['persona'],
): boolean {
  if (item.marker === null) return item.content.trim().length > 0;
  if (card === null) return isFixedItem(item) || isAnchorItem(item);
  return markerHasContent(card, item.marker, persona);
}

/** 会話が使うプリセット。選んでいない・消えていれば null */
export function presetOf(
  chat: Chat,
  presets: ReturnType<typeof usePresetsStore.getState>['presets'],
): (typeof presets)[string] | null {
  return chat.preset === null ? null : (presets[chat.preset.id] ?? null);
}

/** 当てる冊（会話で切った冊・空の冊は出さない）。名前が空ならプリセットの名前で出す */
export function ownLoreOf(
  chat: Chat,
  books: ReturnType<typeof chatLorebooks>,
): ReturnType<typeof lorebookDictionary>[] {
  return books.flatMap((book) =>
    book.off === true || book.entries.length === 0
      ? []
      : [lorebookDictionary({ ...book, name: book.name || (chat.preset?.name ?? '') })],
  );
}

/** 送るワークフローの定義（`tools`）の見積もり。定義が無ければ 0 */
export function toolTokensOf(tools: ReturnType<typeof toChatTools>, ratio: number): number {
  if (tools.length === 0) return 0;
  return estimateMessage(JSON.stringify(tools.map((item) => item.definition)), ratio);
}

/** 前回の送信が上限を超えたか。どちらかが分からなければ超えていないとみなす */
export function isOverLimit(lastActual: number | null, limit: number | null): boolean {
  return limit !== null && lastActual !== null && lastActual > limit;
}

/**
 * 上限の内訳の文。文脈の長さが分からなければ空
 */
export function limitDetailOf(context: number | null, maxTokens: number | undefined): string {
  if (context === null) return '';
  if (maxTokens === undefined) {
    const reserve = replyReserveOf(context, maxTokens);
    return t('llm.prompt.limitDetailNoMax', { context, reserve });
  }
  return t('llm.prompt.limitDetail', { context, maxTokens });
}

/**
 * プロンプトのタブのプレイブックの行。補足はプレイブックの名前と今のフェーズ
 * （今の段はプレイブックの辞書の項目として追加辞書の行に出る）
 */
export function playbookRow(
  state: ChatPlaybook,
  sources: PromptSources,
  tokens: number | undefined,
): PlaybookPromptRow {
  return {
    summary: t('llm.playbook.rowSummary', {
      name: state.playbook.name,
      phase: currentPhase(state)?.name ?? '',
    }),
    text: applyMacros(playbookText(state), sources),
    tokens,
  };
}

function headOf(text: string): string {
  return text.trim().split('\n')[0] ?? '';
}

/**
 * 項目が会話の写しのどの欄を直すか。印はいつも、メインプロンプトと履歴後の指示は
 * 欄に値があるとき（置き換えているとき）だけ。写しもプリセットも無ければ null
 */
function cardEditOf(chat: Chat, item: PromptItem, view: CardView | null): ItemSummary['card'] {
  const field = cardFieldOf(item);
  if (view === null || field === null) return null;
  const value = cardFieldValue(view, field);
  if (item.marker === null && (value.trim().length === 0 || !chat.prompt.usePresetOverrides)) {
    return null;
  }
  return { field, value };
}
