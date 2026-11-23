import { characterView, type CardView } from '@/chat/card';
import { applyMacros, nameSources, type PromptSources } from '@/chat/macros';
import type { CharacterFields, Chat, ChatMessage, Persona } from '@/chat/types';

export function greetingMessage(
  view: CardView,
  id: string,
  sources: PromptSources = nameSources(view, null),
): ChatMessage | null {
  const contents = [view.firstMes, ...view.alternateGreetings]
    .filter((item) => item.trim().length > 0)
    .map((item) => applyMacros(item, sources));
  if (contents.length === 0) return null;
  return {
    id,
    role: 'assistant',
    candidates: contents.map((content) => ({
      content,
      reasoning: '',
      end: { kind: 'done', reason: null },
    })),
    selected: 0,
  };
}

interface GreetingSource {
  readonly character: CharacterFields | null;
  readonly persona: Persona | null;
  readonly messages: readonly ChatMessage[];
}

function greetingOf(source: GreetingSource, id: string): ChatMessage | null {
  if (source.character === null) return null;
  const names = nameSources(source.character, source.persona);
  return greetingMessage(characterView(source.character), id, names);
}

function sameContents(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.candidates.length === b.candidates.length &&
    a.candidates.every((candidate, index) => candidate.content === b.candidates[index]?.content)
  );
}

export function clearedChat(chat: Chat, newId: () => string): Chat {
  const greeting = greetingOf(chat, newId());
  return { ...chat, messages: greeting === null ? [] : [greeting], summary: undefined };
}

export function syncedGreeting(
  before: GreetingSource,
  after: GreetingSource,
  newId: () => string,
): readonly ChatMessage[] {
  const { messages } = after;
  const [only] = messages;
  if (messages.length > 1) return messages;
  if (only !== undefined) {
    const previous = greetingOf(before, only.id);
    if (only.role !== 'assistant' || previous === null || !sameContents(only, previous)) {
      return messages;
    }
  }
  const greeting = greetingOf(after, only?.id ?? newId());
  if (greeting === null) return [];
  if (only !== undefined && sameContents(only, greeting)) return messages;
  const selected = Math.min(only?.selected ?? 0, greeting.candidates.length - 1);
  return [{ ...greeting, selected }];
}
