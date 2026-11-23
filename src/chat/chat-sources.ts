import { presetSources } from '@/chat/card';
import { lorebookDictionary, type Dictionary } from '@/chat/dictionary';
import type { LoreSource, OwnLorebook } from '@/chat/lore';
import { nameSources, type PromptSources } from '@/chat/macros';
import type { CharacterFields, Chat, ChatMessage, Persona } from '@/chat/types';

export interface LoreLibrary {
  readonly dictionaries: Readonly<Record<string, Dictionary>>;
  readonly enabledIds: readonly string[];
  readonly on?: boolean | undefined;
}

export function characterOf(chat: Chat): CharacterFields | null {
  return chat.character;
}

export function chatLorebooks(chat: Chat): readonly OwnLorebook[] {
  return chat.lorebooks ?? [];
}

export function chatImageId(chat: Chat): string | null {
  return chat.imageId ?? null;
}

export function loreSourcesOf(chat: Chat, library: LoreLibrary): LoreSource[] {
  if (library.on === false) return [];
  const global = library.enabledIds.flatMap((id) => {
    const dictionary = library.dictionaries[id];
    return dictionary === undefined
      ? []
      : [{ id, entries: dictionary.entries, scanDepth: dictionary.scanDepth }];
  });
  const own = chatLorebooks(chat).flatMap((book) =>
    book.off === true || book.entries.length === 0
      ? []
      : [
          {
            id: lorebookDictionary(book).id,
            entries: book.entries,
            budgetFirst: true,
            scanDepth: book.scanDepth,
          },
        ],
  );
  return [...global, ...own];
}

export function loreMessages(chat: Chat, draft: string | undefined): readonly ChatMessage[] {
  if (draft === undefined || draft.trim().length === 0) return chat.messages;
  const message: ChatMessage = {
    id: ':draft',
    role: 'user',
    candidates: [{ content: draft, reasoning: '', end: { kind: 'done', reason: null } }],
    selected: 0,
  };
  return [...chat.messages, message];
}

export function chatNameSources(
  character: CharacterFields | null,
  persona: Persona | null,
): PromptSources {
  return nameSources(character, persona);
}

export function macroSourcesOf(chat: Chat): PromptSources {
  const fields = characterOf(chat);
  const names = chatNameSources(fields, chat.persona);
  return fields === null ? names : presetSources(fields, chat.prompt, names);
}

export function changesLorePreview(previous: string, next: string): boolean {
  const cleared = next.trim().length === 0 && previous.trim().length > 0;
  return cleared || lineCount(previous) !== lineCount(next);
}

function lineCount(text: string): number {
  return text.split('\n').length;
}
