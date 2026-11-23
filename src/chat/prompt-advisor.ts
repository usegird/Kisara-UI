import { EMPTY_CHARACTER } from '@/chat/card';
import { blankDictionaryEntry } from '@/chat/dictionary';
import type { LoreEntry, OwnLorebook } from '@/chat/lore';
import { outlineStepEntry, stepKey } from '@/chat/playbook-outline';
import {
  addPromptItem,
  removePromptItem,
  updatePrefill,
  updatePromptItem,
  withSourceMarkers,
} from '@/chat/prompt';
import { changedRowsOf, entryRowOf, FIELD_MARKER, rowsOfChange } from '@/chat/prompt-advisor-rows';
import { isReservedBookName } from '@/chat/reserved-book';
import {
  MAIN_PROMPT_ID,
  type CharacterFields,
  type Chat,
  type PromptComposition,
  type PromptItem,
} from '@/chat/types';
import type { Citation, TokenUsage, ToolBilling } from '@/port/llm-port';

export const PROPOSAL_FENCE = 'kisara-prompt';

export const CHARACTER_FIELDS = [
  'name',
  'description',
  'personality',
  'scenario',
  'mesExample',
  'firstMes',
] as const;

export type AdvisorCharacterField = (typeof CHARACTER_FIELDS)[number];

export type AdvisorChange =
  | { readonly target: 'main'; readonly content: string }
  | { readonly target: 'item'; readonly id: string; readonly content: string }
  | {
      readonly target: 'newItem';
      readonly name: string;
      readonly place: 'before' | 'after';
      readonly content: string;
    }
  | { readonly target: 'removeItem'; readonly id: string }
  | {
      readonly target: 'character';
      readonly field: AdvisorCharacterField;
      readonly content: string;
    }
  | { readonly target: 'prefill'; readonly content: string }
  | {
      readonly target: 'dictionaryEntry';
      readonly dictionary: string;
      readonly keys: readonly string[];
      readonly content: string;
      readonly constant: boolean;
      readonly comment: string;
      readonly enabled: boolean;
    };

export interface AdvisorProposal {
  readonly title: string;
  readonly changes: readonly AdvisorChange[];
}

export type AdvisorTarget = Pick<Chat, 'prompt' | 'character' | 'lorebooks'>;

export function advisorTargetOf(chat: Chat): AdvisorTarget {
  return { prompt: chat.prompt, character: chat.character, lorebooks: chat.lorebooks };
}

export interface AdvisorMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly usage?: TokenUsage | undefined;
  readonly reasoning?: string | undefined;
  readonly finishReason?: string | undefined;
  readonly toolCalls?: readonly AdvisorToolCall[] | undefined;
  readonly billing?: ToolBilling | undefined;
  readonly citations?: readonly Citation[] | undefined;
}

export interface AdvisorToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

const SENT_ID: Readonly<Record<string, string>> = {
  chatHistory: 'sessionHistory',
  currentInput: 'messageToSend',
  additionalInfo: 'dictionaryHits',
  personaDescription: 'userProfile',
  charDescription: 'characterDescription',
  charPersonality: 'personalitySummary',
  scenario: 'currentSituation',
  jailbreak: 'afterHistoryInstruction',
  nsfw: 'auxiliaryPrompt',
  enhanceDefinitions: 'definitionBoost',
};

export const SENT_FIELD: Readonly<Record<AdvisorCharacterField, string>> = {
  name: 'assistantName',
  description: 'characterDescription',
  personality: 'personalitySummary',
  scenario: 'currentSituation',
  mesExample: 'dialogueExamples',
  firstMes: 'firstMessage',
};

export const sentId = (id: string): string => SENT_ID[id] ?? id;

export function internalId(id: string): string {
  return Object.keys(SENT_ID).find((key) => SENT_ID[key] === id) ?? id;
}

export const ADVISOR_USES = ['blank', 'work', 'story', 'roleplay', 'game'] as const;

export type AdvisorUse = (typeof ADVISOR_USES)[number];

export function usesCard(use: AdvisorUse): boolean {
  return use !== 'work';
}

export interface AdvisorGuide {
  readonly use: AdvisorUse;
  readonly visible: string;
  readonly guide: string;
  readonly outline: string | null;
}

function allowsChange(
  use: AdvisorUse,
  change: AdvisorChange,
  outline: string | null = null,
): boolean {
  if (change.target === 'dictionaryEntry' && outline !== null && change.dictionary === outline) {
    return true;
  }
  return usesCard(use) || (change.target !== 'character' && change.target !== 'dictionaryEntry');
}

interface AppliedProposal {
  readonly next: AdvisorTarget;
  readonly applied: number;
  readonly changedRows: readonly string[];
}

interface ApplyOptions {
  readonly newId: () => string;
  readonly lorebookName: string;
  readonly use?: AdvisorUse | undefined;
  readonly outline?: string | null | undefined;
  readonly keepSituation?: boolean | undefined;
}

export function applyProposal(
  target: AdvisorTarget,
  proposal: AdvisorProposal,
  options: ApplyOptions,
): AppliedProposal {
  const { lorebookName, outline = null } = options;
  let { prompt, character, lorebooks } = target;
  const fields: AdvisorCharacterField[] = [];
  const rows = new Set<string>();
  const newId = (): string => {
    const id = options.newId();
    rows.add(id);
    return id;
  };
  let applied = 0;
  for (const change of proposal.changes) {
    if (skipsChange(change, options)) continue;
    if (change.target === 'character') {
      character = { ...(character ?? EMPTY_CHARACTER), [change.field]: change.content };
      fields.push(change.field);
      applied += 1;
      continue;
    }
    if (change.target === 'dictionaryEntry') {
      if (isReservedBookName(change.dictionary) && change.dictionary !== outline) continue;
      const naming = { fallbackName: lorebookName, newId: options.newId, outline };
      lorebooks = withLoreEntry(lorebooks ?? [], change, naming);
      rows.add(entryRowOf(change.dictionary, outline));
      applied += 1;
      continue;
    }
    const next = writeToPrompt(prompt, change, newId);
    if (next === null) continue;
    prompt = next;
    rowsOfChange(change).forEach((row) => rows.add(row));
    applied += 1;
  }
  if (character !== null) prompt = withFieldMarkers(prompt, character, fields);
  const changedRows = changedRowsOf(prompt, rows, fields);
  return { next: { prompt, character, lorebooks }, applied, changedRows };
}

function skipsChange(
  change: AdvisorChange,
  { use, outline = null, keepSituation = false }: ApplyOptions,
): boolean {
  if (use !== undefined && !allowsChange(use, change, outline)) return true;
  if (change.target === 'newItem' && isReservedBookName(change.name.trim())) return true;
  return keepSituation && change.target === 'character' && change.field === 'scenario';
}

function writeToPrompt(
  prompt: PromptComposition,
  change: Exclude<AdvisorChange, { target: 'character' | 'dictionaryEntry' }>,
  newId: () => string,
): PromptComposition | null {
  switch (change.target) {
    case 'main':
      return writeMain(prompt, change.content);
    case 'item':
      return writeItem(prompt, change.id, change.content);
    case 'newItem': {
      const id = newId();
      const added = addPromptItem(prompt, id, change.place, change.name);
      return updatePromptItem(added, id, { content: change.content }) ?? added;
    }
    case 'removeItem':
      return removePromptItem(prompt, change.id);
    case 'prefill':
      return updatePrefill(prompt, { content: change.content, enabled: true }) ?? prompt;
  }
}

function writeMain(prompt: PromptComposition, content: string): PromptComposition {
  const written = writeItem(prompt, MAIN_PROMPT_ID, content);
  if (written !== null) return written;
  const main: PromptItem = {
    id: MAIN_PROMPT_ID,
    name: '',
    role: 'system',
    marker: null,
    content,
    enabled: true,
    position: { kind: 'relative' },
  };
  return { ...prompt, items: [main, ...prompt.items] };
}

function writeItem(
  prompt: PromptComposition,
  id: string,
  content: string,
): PromptComposition | null {
  const item = prompt.items.find((entry) => entry.id === id);
  if (item === undefined || item.marker !== null) return null;
  const enabled = content.trim().length > 0 ? true : item.enabled;
  return updatePromptItem(prompt, id, { content, enabled }) ?? prompt;
}

function withLoreEntry(
  books: readonly OwnLorebook[],
  change: Extract<AdvisorChange, { target: 'dictionaryEntry' }>,
  naming: {
    readonly fallbackName: string;
    readonly newId: () => string;
    readonly outline: string | null;
  },
): OwnLorebook[] {
  const { fallbackName, newId, outline } = naming;
  const step = outline !== null && change.dictionary === outline;
  const entry: LoreEntry = {
    ...(step ? outlineStepEntry() : blankDictionaryEntry()),
    keys: step ? [stepKey(change)] : change.keys,
    content: change.content,
    constant: step || change.constant,
    comment: change.comment,
    enabled: change.enabled,
  };
  const named = change.dictionary;
  const at = targetBookIndex(books, named);
  if (at < 0) {
    const name = named.length > 0 ? named : fallbackName;
    return [...books, { id: newId(), name, entries: [entry] }];
  }
  return books.map((book, index) =>
    index === at ? { id: book.id, name: book.name, entries: [...book.entries, entry] } : book,
  );
}

function targetBookIndex(books: readonly OwnLorebook[], named: string): number {
  if (named.length > 0) return books.findIndex((book) => book.name === named);
  return books.length > 0 ? 0 : -1;
}

function withFieldMarkers(
  prompt: PromptComposition,
  character: CharacterFields,
  fields: readonly AdvisorCharacterField[],
): PromptComposition {
  const markers = fields.flatMap((field) => {
    const marker = FIELD_MARKER[field];
    return marker !== undefined && character[field].trim().length > 0 ? [marker] : [];
  });
  if (markers.length === 0) return prompt;
  const added = withSourceMarkers(prompt);
  return {
    ...added,
    items: added.items.map((item) =>
      item.marker !== null && markers.includes(item.marker) ? { ...item, enabled: true } : item,
    ),
  };
}
