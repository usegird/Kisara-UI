import { presetSources } from '@/chat/card';
import { lorebookDictionary, type Dictionary } from '@/chat/dictionary';
import type { LoreSource, OwnLorebook } from '@/chat/lore';
import { nameSources, type PromptSources } from '@/chat/macros';
import type { CharacterFields, Chat, ChatMessage, Persona } from '@/chat/types';

// ─────────────────────────────
// 会話が送る中身へ出すもの（写しの欄・個別追加辞書・アバター・名前と変数・当てるロアの出どころ）を
// 会話から読む。全体の状態は呼ぶ側が渡す。
// ─────────────────────────────

/** ロアを当てるときの全体の状態（追加辞書の一覧と、全体で有効にした並び） */
export interface LoreLibrary {
  readonly dictionaries: Readonly<Record<string, Dictionary>>;
  readonly enabledIds: readonly string[];
  /**
   * 動的追加辞書のカードを入れているか。切っていれば個別追加辞書も当てない。既定は入れている
   */
  readonly on?: boolean | undefined;
}

/**
 * 会話の写しの欄を返す。無ければ null。送る・当てる・画面に出すときは会話の写しだけを読み、
 * プリセットは読まない（プリセットを読むのは選んだときだけ）
 */
export function characterOf(chat: Chat): CharacterFields | null {
  return chat.character;
}

/**
 * 会話の個別追加辞書の並びを返す。無ければ空
 */
export function chatLorebooks(chat: Chat): readonly OwnLorebook[] {
  return chat.lorebooks ?? [];
}

/**
 * 会話が写したアバターの id を返す。無ければ null
 */
export function chatImageId(chat: Chat): string | null {
  return chat.imageId ?? null;
}

/**
 * 当てる出どころを並べる。全体で有効にした辞書が先、会話の個別追加辞書が後。
 * 一覧に無い辞書は当てない
 */
export function loreSourcesOf(chat: Chat, library: LoreLibrary): LoreSource[] {
  // 動的追加辞書を切っていれば、全体の辞書も個別追加辞書も当てない
  if (library.on === false) return [];
  // 全体で有効にした辞書の後に、個別追加辞書。予算は個別の側を先に足す
  const global = library.enabledIds.flatMap((id) => {
    const dictionary = library.dictionaries[id];
    return dictionary === undefined
      ? []
      : [{ id, entries: dictionary.entries, scanDepth: dictionary.scanDepth }];
  });
  // 並びの順に 1 冊ずつ。会話で切った辞書は当てない
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

/** 当てるときに見る発言を返す。打ちかけの本文があれば今回のメッセージとして末尾に足す */
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

/** 会話の名前と変数の置き換えの出どころ（送る・画面に出す・追加辞書を当てるときで同じ） */
export function chatNameSources(
  character: CharacterFields | null,
  persona: Persona | null,
): PromptSources {
  return nameSources(character, persona);
}

/** 追加辞書を当てる前の出どころ（`{{user}}`・`{{char}}`・自分で足した変数と、カードの欄） */
export function macroSourcesOf(chat: Chat): PromptSources {
  const fields = characterOf(chat);
  const names = chatNameSources(fields, chat.persona);
  return fields === null ? names : presetSources(fields, chat.prompt, names);
}

/** 打ちかけを変えたとき、見込みを作り直すかを判定する（行の数が変わった・空にした） */
export function changesLorePreview(previous: string, next: string): boolean {
  const cleared = next.trim().length === 0 && previous.trim().length > 0;
  return cleared || lineCount(previous) !== lineCount(next);
}

/** 打ちかけの本文の行の数 */
function lineCount(text: string): number {
  return text.split('\n').length;
}
