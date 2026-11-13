import { characterView, type CardView } from '@/chat/card';
import { applyMacros, nameSources, type PromptSources } from '@/chat/macros';
import type { CharacterFields, Chat, ChatMessage, Persona } from '@/chat/types';

// ─────────────────────────────
// カードの最初の発言を会話の先頭に置く・カードを替えたときに合わせる。
// ─────────────────────────────

/**
 * 会話の最初の発言。`first_mes` と `alternate_greetings` を候補に持つ `assistant`。
 * `{{char}}`・`{{user}}` はこのとき置き換える。挨拶が 1 つも無ければ null
 */
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

/** 最初の発言を写し直すのに見る会話の値 */
interface GreetingSource {
  readonly character: CharacterFields | null;
  readonly persona: Persona | null;
  readonly messages: readonly ChatMessage[];
}

/** 欄と利用者の名前から作る最初の発言。欄が無いか挨拶が全部空なら null */
function greetingOf(source: GreetingSource, id: string): ChatMessage | null {
  if (source.character === null) return null;
  const names = nameSources(source.character, source.persona);
  return greetingMessage(characterView(source.character), id, names);
}

/** 2 つの発言の候補の本文が同じか */
function sameContents(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.candidates.length === b.candidates.length &&
    a.candidates.every((candidate, index) => candidate.content === b.candidates[index]?.content)
  );
}

/**
 * 発言と要約を消した会話（会話をクリア）。ほかの持ち物は残し、
 * プリセットの欄があれば最初の発言だけを写し直す
 */
export function clearedChat(chat: Chat, newId: () => string): Chat {
  const greeting = greetingOf(chat, newId());
  return { ...chat, messages: greeting === null ? [] : [greeting], summary: undefined };
}

/**
 * 欄か利用者の名前を変えたあとの発言。始めていない会話（発言が無いか、
 * 変える前の欄から写した最初の発言だけ）なら、最初の発言を変えたあとの欄で写し直す（全部空なら外す）。
 * 始めた会話はそのまま返す
 */
export function syncedGreeting(
  before: GreetingSource,
  after: GreetingSource,
  newId: () => string,
): readonly ChatMessage[] {
  const { messages } = after;
  const [only] = messages;
  if (messages.length > 1) return messages;
  if (only !== undefined) {
    // 1 つだけの発言が、変える前の欄から写した最初の発言のままでなければ、始めた会話とみなす
    const previous = greetingOf(before, only.id);
    if (only.role !== 'assistant' || previous === null || !sameContents(only, previous)) {
      return messages;
    }
  }
  const greeting = greetingOf(after, only?.id ?? newId());
  if (greeting === null) return [];
  if (only !== undefined && sameContents(only, greeting)) return messages;
  // 選んでいた候補は、候補の列の中に収まる限り残す
  const selected = Math.min(only?.selected ?? 0, greeting.candidates.length - 1);
  return [{ ...greeting, selected }];
}
