import type { Lorebook, LoreEntry } from '@/chat/lore';
import { nameSources, type PromptSources } from '@/chat/macros';
import { importedBookName } from '@/chat/reserved-book';
import {
  MAIN_PROMPT_ID,
  POST_HISTORY_ID,
  type CharacterFields,
  type ChatVariable,
  type Persona,
  type PromptComposition,
  type PromptItem,
  type PromptMarker,
  type PromptRole,
} from '@/chat/types';
import { AUTHOR_NOTE_DEPTH, parseCardBook } from '@/chat/world-info';
import { finiteNumber, isRecord, isUnknownArray, stringArray, stringOr } from '@/lib/guards';

export interface CardView extends CharacterFields {
  readonly lorebook: readonly LoreEntry[];
}

export const EMPTY_CHARACTER: CharacterFields = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  mesExample: '',
  firstMes: '',
  alternateGreetings: [],
  creatorNotes: '',
  systemPrompt: '',
  postHistoryInstructions: '',
};

const ROLES: readonly PromptRole[] = ['system', 'user', 'assistant'];

const CHARACTER_NOTE_COMMENT = "Character's Note";

function characterNoteEntry(raw: unknown): LoreEntry | null {
  if (!isRecord(raw) || typeof raw.prompt !== 'string' || raw.prompt.trim() === '') return null;
  return {
    keys: [],
    secondaryKeys: [],
    logic: 'or',
    probability: 100,
    caseSensitive: false,
    content: raw.prompt,
    enabled: true,
    constant: true,
    side: 'after',
    depth: {
      depth: Math.max(0, Math.trunc(finiteNumber(raw.depth) ?? AUTHOR_NOTE_DEPTH)),
      role: ROLES.find((role) => role === raw.role) ?? 'system',
    },
    historyStart: false,
    scanDepth: null,
    order: 100,
    priority: Number.MAX_SAFE_INTEGER,
    comment: CHARACTER_NOTE_COMMENT,
  };
}

function withCharacterNote(book: Lorebook | null, note: LoreEntry | null): Lorebook | null {
  if (note === null) return book;
  return { name: book?.name ?? '', entries: [...(book?.entries ?? []), note] };
}

export function cardLorebook(card: Record<string, unknown>): Lorebook | null {
  const book = cardBook(card);
  const entries = parseCardBook(book);
  const name = typeof book?.name === 'string' ? importedBookName(book.name) : '';
  const data = isRecord(card.data) ? card.data : {};
  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const base = entries.length === 0 && name.length === 0 ? null : { name, entries };
  return withCharacterNote(base, characterNoteEntry(extensions.depth_prompt));
}

export function cardFields(card: Record<string, unknown>): CharacterFields {
  const data = isRecord(card.data) ? card.data : {};
  const nickname = card.spec === 'chara_card_v3' ? stringOr(data.nickname).trim() : '';
  const greetings = isUnknownArray(data.alternate_greetings) ? data.alternate_greetings : [];
  return {
    name: nickname.length > 0 ? nickname : stringOr(data.name),
    description: stringOr(data.description),
    personality: stringOr(data.personality),
    scenario: stringOr(data.scenario),
    mesExample: stringOr(data.mes_example),
    firstMes: stringOr(data.first_mes),
    alternateGreetings: greetings.filter((item): item is string => typeof item === 'string'),
    creatorNotes: stringOr(data.creator_notes),
    systemPrompt: stringOr(data.system_prompt),
    postHistoryInstructions: stringOr(data.post_history_instructions),
  };
}

function cardBook(card: Record<string, unknown>): Readonly<Record<string, unknown>> | null {
  const data = isRecord(card.data) ? card.data : {};
  return isRecord(data.character_book) ? data.character_book : null;
}

export function characterView(
  fields: CharacterFields,
  lorebook: readonly LoreEntry[] = [],
): CardView {
  return { ...fields, lorebook };
}

export function parseCharacterFields(raw: unknown): CharacterFields | null {
  if (!isRecord(raw)) return null;
  return {
    name: stringOr(raw.name),
    description: stringOr(raw.description),
    personality: stringOr(raw.personality),
    scenario: stringOr(raw.scenario),
    mesExample: stringOr(raw.mesExample),
    firstMes: stringOr(raw.firstMes),
    alternateGreetings: stringArray(raw.alternateGreetings),
    creatorNotes: stringOr(raw.creatorNotes),
    systemPrompt: stringOr(raw.systemPrompt),
    postHistoryInstructions: stringOr(raw.postHistoryInstructions),
    ...variablesOf(raw.variables),
  };
}

function variablesOf(raw: unknown): { readonly variables?: readonly ChatVariable[] } {
  if (!isUnknownArray(raw)) return {};
  const variables = raw.filter(isRecord).map((item, index) => ({
    id: stringOr(item.id) || `v${String(index)}`,
    name: stringOr(item.name),
    value: stringOr(item.value),
    ...(item.restore === true ? { restore: true as const } : {}),
  }));
  return variables.length === 0 ? {} : { variables };
}

export function cardMarkerText(view: CharacterFields, marker: PromptMarker): string {
  switch (marker) {
    case 'charDescription':
      return view.description;
    case 'charPersonality':
      return view.personality;
    case 'scenario':
      return view.scenario;
    case 'dialogueExamples':
      return view.mesExample;
    default:
      return '';
  }
}

export function presetSources(
  view: CharacterFields,
  composition: PromptComposition,
  names: PromptSources = nameSources(view, null),
): PromptSources {
  const overrides: Readonly<Record<string, string>> = composition.usePresetOverrides
    ? { [MAIN_PROMPT_ID]: view.systemPrompt, [POST_HISTORY_ID]: view.postHistoryInstructions }
    : {};
  return {
    userName: names.userName,
    charName: names.charName,
    variables: names.variables,
    markerText: (marker) => cardMarkerText(view, marker),
    overrideText: (itemId, original) => {
      const text = overrides[itemId] ?? '';
      return text.trim().length === 0 ? null : text.replace(/\{\{original\}\}/gi, original);
    },
  };
}

export function markerHasContent(
  view: CardView,
  marker: PromptMarker,
  persona: Persona | null,
): boolean {
  if (marker === 'chatHistory' || marker === 'currentInput' || marker === 'additionalInfo') {
    return true;
  }
  if (marker === 'personaDescription') return (persona?.description.trim() ?? '') !== '';
  return cardMarkerText(view, marker).trim() !== '';
}

export function cardComposition(view: CardView): PromptComposition {
  const relative = { kind: 'relative' } as const;
  const textItems = (id: string, content: string): PromptItem[] =>
    content.trim().length === 0
      ? []
      : [
          {
            id,
            name: '',
            role: 'system',
            marker: null,
            content: '',
            enabled: true,
            position: relative,
          },
        ];
  const marker = (id: PromptMarker, role: PromptRole = 'system'): PromptItem => ({
    id,
    name: '',
    role,
    marker: id,
    content: '',
    enabled: true,
    position: relative,
  });
  return {
    items: [
      ...textItems(MAIN_PROMPT_ID, view.systemPrompt),
      marker('personaDescription'),
      marker('charDescription'),
      marker('charPersonality'),
      marker('dialogueExamples'),
      marker('additionalInfo'),
      marker('scenario'),
      marker('chatHistory'),
      marker('currentInput', 'user'),
      ...textItems(POST_HISTORY_ID, view.postHistoryInstructions),
    ],
    prefill: { content: '', enabled: false },
    usePresetOverrides: true,
  };
}

export type CardField = Extract<
  keyof CharacterFields,
  | 'description'
  | 'personality'
  | 'scenario'
  | 'mesExample'
  | 'systemPrompt'
  | 'postHistoryInstructions'
>;

export function cardFieldOf(item: PromptItem): CardField | null {
  switch (item.marker ?? item.id) {
    case 'charDescription':
      return 'description';
    case 'charPersonality':
      return 'personality';
    case 'scenario':
      return 'scenario';
    case 'dialogueExamples':
      return 'mesExample';
    case MAIN_PROMPT_ID:
      return 'systemPrompt';
    case POST_HISTORY_ID:
      return 'postHistoryInstructions';
    default:
      return null;
  }
}

export function cardFieldValue(view: CharacterFields, field: CardField): string {
  return view[field];
}
