import { blankDictionaryEntry } from '@/chat/dictionary';
import type { LoreEntry, OwnLorebook } from '@/chat/lore';
import type { ChatPlaybook, ChatPlaybookRef, Playbook, PlaybookPhase } from '@/chat/playbook';
import type { Chat } from '@/chat/types';

// ─────────────────────────────
// 会話のプレイブックの操作。アウトラインは、会話の個別追加辞書のうち予約の名前の 1 冊に持ち（項目 1 つが
// 段 1 つ）、会話の側はどのプレイブックか（参照）と今のフェーズだけを持つ。
// ─────────────────────────────

/** プレイブックの辞書の名前（予約。利用者は付けられない） */
export const PLAYBOOK_BOOK = '##playbook';

/** 新しく足すときのプレイブックの辞書の id（会話の中で 1 冊なので固定でよい） */
export const PLAYBOOK_BOOK_ID = 'playbook';

/** 題の無い段の項目のトリガーワード（`*` の後ろ） */
const OUTLINE_KEY = 'outline';

/**
 * 段の項目の既定の形。有効・題・本文は足す側が決める
 */
export function outlineStepEntry(): LoreEntry {
  return {
    ...blankDictionaryEntry(),
    keys: [OUTLINE_KEY],
    constant: true,
    depth: { depth: 0, role: 'system' },
  };
}

/**
 * 段の項目のトリガーワード。題を入れるのは、閉じた辞書の欄で何の段かを読めるようにするため。
 * 区切りの「,」「、」は空白に替える（キーが割れないように）
 */
export function stepKey(entry: Pick<LoreEntry, 'comment' | 'content'>): string {
  const title = stepTitle(entry).replace(/[,、]/gu, ' ').trim();
  return title.length > 0 ? `【${title}】` : OUTLINE_KEY;
}

/** プレイブックの辞書の段の項目のトリガーワードを、題に合わせ直す */
export function withStepKeys(entries: readonly LoreEntry[]): LoreEntry[] {
  return entries.map((entry) => {
    const key = stepKey(entry);
    return entry.keys.length === 1 && entry.keys[0] === key ? entry : { ...entry, keys: [key] };
  });
}

/** プレイブックの操作が読み書きする会話の部分 */
export type PlaybookChat = Pick<Chat, 'playbook' | 'lorebooks'>;

/** 会話のプレイブックと個別追加辞書の並びを書き換えた結果 */
export interface PlaybookPatch {
  readonly playbook: ChatPlaybookRef;
  readonly lorebooks: readonly OwnLorebook[];
}

/** プレイブックの辞書（`##playbook`）。無ければ undefined */
export function playbookBook(chat: Pick<Chat, 'lorebooks'>): OwnLorebook | undefined {
  return chat.lorebooks?.find((book) => book.name === PLAYBOOK_BOOK);
}

/** プレイブックの辞書の並びを書き換える。無ければ空の 1 冊を足してから書き換える */
function withBook(
  books: readonly OwnLorebook[],
  edit: (entries: readonly LoreEntry[]) => readonly LoreEntry[],
): readonly OwnLorebook[] {
  const at = books.findIndex((book) => book.name === PLAYBOOK_BOOK);
  if (at < 0) return [...books, { id: PLAYBOOK_BOOK_ID, name: PLAYBOOK_BOOK, entries: edit([]) }];
  return books.map((book, index) =>
    index === at ? { ...book, entries: [...edit(book.entries)] } : book,
  );
}

/** 段の並びの位置で有効を書き換える */
function enableSteps(
  books: readonly OwnLorebook[],
  enabled: (step: number) => boolean,
): readonly OwnLorebook[] {
  return withBook(books, (entries) =>
    entries.map((entry, step) => ({ ...entry, enabled: enabled(step) })),
  );
}

/**
 * プレイブックを選ぶ。先頭のフェーズにいる。プレイブックの辞書があれば引き継いで先頭の段だけを有効にし、
 * 無ければ空の 1 冊を足す
 */
export function startPlaybook(chat: PlaybookChat, playbook: Playbook): PlaybookPatch {
  return {
    playbook: { origin: playbook.origin, id: playbook.id, phase: playbook.phases[0]?.id ?? '' },
    // アウトラインの最初から始める
    lorebooks: enableSteps(chat.lorebooks ?? [], (step) => step === 0),
  };
}

/**
 * プレイブックを外す。どれかと今のフェーズと今の段だけを消し（段はどれも切る）、プレイブックの辞書
 * （アウトライン）は残す。選んでいなければ null
 */
export function stopPlaybook(chat: PlaybookChat): Pick<Chat, 'playbook' | 'lorebooks'> | null {
  if (chat.playbook === undefined) return null;
  return {
    playbook: undefined,
    lorebooks:
      playbookBook(chat) === undefined
        ? (chat.lorebooks ?? [])
        : enableSteps(chat.lorebooks ?? [], () => false),
  };
}

/** 今のフェーズ。指す先が無ければ先頭 */
export function currentPhase(state: ChatPlaybook): PlaybookPhase | undefined {
  const phases = state.playbook.phases;
  return phases.find((phase) => phase.id === state.phase) ?? phases[0];
}

/** アウトラインの段（プレイブックの辞書の項目）。無ければ空 */
export function outlineSteps(chat: Pick<Chat, 'lorebooks'>): readonly LoreEntry[] {
  return playbookBook(chat)?.entries ?? [];
}

/** 今の段の位置（有効な段のうち並びで先の 1 つ）。どれも切っていれば null */
export function currentStep(chat: Pick<Chat, 'lorebooks'>): number | null {
  const at = outlineSteps(chat).findIndex((entry) => entry.enabled);
  return at < 0 ? null : at;
}

/** 段の有効を書き換える。段が無いかプレイブックが無ければ null */
function withSteps(chat: PlaybookChat, enabled: (step: number) => boolean): PlaybookPatch | null {
  if (chat.playbook === undefined || outlineSteps(chat).length === 0) return null;
  return { playbook: chat.playbook, lorebooks: enableSteps(chat.lorebooks ?? [], enabled) };
}

/** 段の題（項目のコメント）と本文を直す。範囲の外なら null */
export function editStep(
  chat: PlaybookChat,
  index: number,
  change: Partial<Pick<LoreEntry, 'comment' | 'content'>>,
): PlaybookPatch | null {
  if (chat.playbook === undefined || outlineSteps(chat)[index] === undefined) return null;
  return {
    playbook: chat.playbook,
    lorebooks: withBook(chat.lorebooks ?? [], (entries) =>
      entries.map((entry, step) => {
        if (step !== index) return entry;
        const next = { ...entry, ...change };
        return { ...next, keys: [stepKey(next)] };
      }),
    ),
  };
}

/** 段の見出し。題（コメント）が空なら本文の 1 行目 */
export function stepTitle(entry: Pick<LoreEntry, 'comment' | 'content'>): string {
  const comment = entry.comment.trim();
  return comment.length > 0 ? comment : (entry.content.trim().split('\n')[0] ?? '').trim();
}

/** その段だけを有効にする。範囲の外なら null */
export function withStep(chat: PlaybookChat, index: number): PlaybookPatch | null {
  if (index < 0 || index >= outlineSteps(chat).length) return null;
  return withSteps(chat, (at) => at === index);
}

/** 次の段へ（今の段を切り、次の段を有効にする）。今の段が無いか最後なら null */
export function nextStep(chat: PlaybookChat): PlaybookPatch | null {
  const current = currentStep(chat);
  return current === null ? null : withStep(chat, current + 1);
}

/** 前の段へ（今の段を切り、前の段を有効にする）。今の段が無いか先頭なら null */
export function prevStep(chat: PlaybookChat): PlaybookPatch | null {
  const current = currentStep(chat);
  return current === null ? null : withStep(chat, current - 1);
}

/** すべての段を有効にする（いくつでも選べるフェーズに入ったとき）。段が無ければ null */
export function withAllSteps(chat: PlaybookChat): PlaybookPatch | null {
  return withSteps(chat, () => true);
}

/** その段の有効を切り替える（いくつでも選べるフェーズ）。範囲の外なら null */
export function toggleStep(chat: PlaybookChat, index: number): PlaybookPatch | null {
  const steps = outlineSteps(chat);
  if (index < 0 || index >= steps.length) return null;
  return withSteps(chat, (at) => (steps[at]?.enabled === true) !== (at === index));
}

/**
 * そのフェーズに移り、フェーズの選び方に合わせて段の有効を整える（`playbook` は引いた定義）。
 * 無いフェーズか今のフェーズなら null
 */
export function enterPhase(
  chat: PlaybookChat,
  playbook: Playbook,
  phaseId: string,
): PlaybookPatch | null {
  const ref = chat.playbook;
  const target = playbook.phases.find((phase) => phase.id === phaseId);
  if (ref === undefined || target === undefined || phaseId === ref.phase) return null;
  const moved: PlaybookChat = { ...chat, playbook: { ...ref, phase: phaseId } };
  const current = currentStep(moved);
  const many = outlineSteps(moved).filter((entry) => entry.enabled).length > 1;
  const started =
    target.outline === 'multi'
      ? withAllSteps(moved)
      : target.kind === 'proceed' && current === null
        ? withStep(moved, 0)
        : target.outline === 'single' && many && current !== null
          ? withStep(moved, current)
          : null;
  return started ?? { playbook: { ...ref, phase: phaseId }, lorebooks: chat.lorebooks ?? [] };
}

// ─────────────────────────────
// 次の段の題の差し込み。前もって全部の文を用意せず、指示を入れるたびに作る
// ─────────────────────────────

/** 今の段の次の段の題。今の段が無いか最後の段なら null */
function nextStepTitle(chat: Pick<Chat, 'lorebooks'>): string | null {
  const at = currentStep(chat);
  const next = at === null ? undefined : outlineSteps(chat)[at + 1];
  return next === undefined ? null : stepTitle(next);
}

/** 指示文の `{{nextStep}}`（大文字小文字を区別しない）を次の段の題に置き換える。無ければ `fallback` */
export function withNextStepTitle(
  text: string,
  chat: Pick<Chat, 'lorebooks'>,
  fallback: string,
): string {
  if (!/\{\{nextStep\}\}/iu.test(text)) return text;
  const title = nextStepTitle(chat) ?? fallback;
  return text.replace(/\{\{nextStep\}\}/giu, () => title);
}
