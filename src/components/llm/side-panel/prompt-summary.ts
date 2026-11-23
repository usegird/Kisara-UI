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

export const NONE: Pick<ItemSummary, 'source' | 'note' | 'lore' | 'card'> = {
  source: '',
  note: '',
  lore: [],
  card: null,
};

export interface HistoryInput extends AdditionalInfoInput {
  readonly counts: { readonly kept: number; readonly dropped: number };
}

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

export function isAdditionalInfo(item: PromptItem): boolean {
  return item.marker === 'additionalInfo';
}

export function characterViewOf(
  fields: ReturnType<typeof characterOf>,
  books: ReturnType<typeof chatLorebooks>,
): ReturnType<typeof characterView> | null {
  return fields === null ? null : characterView(fields, lorebookEntries(books));
}

export function isFilledItem(
  item: PromptItem,
  card: ReturnType<typeof characterView> | null,
  persona: Chat['persona'],
): boolean {
  if (item.marker === null) return item.content.trim().length > 0;
  if (card === null) return isFixedItem(item) || isAnchorItem(item);
  return markerHasContent(card, item.marker, persona);
}

export function presetOf(
  chat: Chat,
  presets: ReturnType<typeof usePresetsStore.getState>['presets'],
): (typeof presets)[string] | null {
  return chat.preset === null ? null : (presets[chat.preset.id] ?? null);
}

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

export function toolTokensOf(tools: ReturnType<typeof toChatTools>, ratio: number): number {
  if (tools.length === 0) return 0;
  return estimateMessage(JSON.stringify(tools.map((item) => item.definition)), ratio);
}

export function isOverLimit(lastActual: number | null, limit: number | null): boolean {
  return limit !== null && lastActual !== null && lastActual > limit;
}

export function limitDetailOf(context: number | null, maxTokens: number | undefined): string {
  if (context === null) return '';
  if (maxTokens === undefined) {
    const reserve = replyReserveOf(context, maxTokens);
    return t('llm.prompt.limitDetailNoMax', { context, reserve });
  }
  return t('llm.prompt.limitDetail', { context, maxTokens });
}

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

function cardEditOf(chat: Chat, item: PromptItem, view: CardView | null): ItemSummary['card'] {
  const field = cardFieldOf(item);
  if (view === null || field === null) return null;
  const value = cardFieldValue(view, field);
  if (item.marker === null && (value.trim().length === 0 || !chat.prompt.usePresetOverrides)) {
    return null;
  }
  return { field, value };
}
