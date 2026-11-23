import { blankDictionaryEntry } from '@/chat/dictionary';
import type { LoreEntry, OwnLorebook } from '@/chat/lore';
import type { ChatPlaybook, ChatPlaybookRef, Playbook, PlaybookPhase } from '@/chat/playbook';
import type { Chat } from '@/chat/types';

export const PLAYBOOK_BOOK = '##playbook';

export const PLAYBOOK_BOOK_ID = 'playbook';

const OUTLINE_KEY = 'outline';

export function outlineStepEntry(): LoreEntry {
  return {
    ...blankDictionaryEntry(),
    keys: [OUTLINE_KEY],
    constant: true,
    depth: { depth: 0, role: 'system' },
  };
}

export function stepKey(entry: Pick<LoreEntry, 'comment' | 'content'>): string {
  const title = stepTitle(entry).replace(/[,、]/gu, ' ').trim();
  return title.length > 0 ? `【${title}】` : OUTLINE_KEY;
}

export function withStepKeys(entries: readonly LoreEntry[]): LoreEntry[] {
  return entries.map((entry) => {
    const key = stepKey(entry);
    return entry.keys.length === 1 && entry.keys[0] === key ? entry : { ...entry, keys: [key] };
  });
}

export type PlaybookChat = Pick<Chat, 'playbook' | 'lorebooks'>;

export interface PlaybookPatch {
  readonly playbook: ChatPlaybookRef;
  readonly lorebooks: readonly OwnLorebook[];
}

export function playbookBook(chat: Pick<Chat, 'lorebooks'>): OwnLorebook | undefined {
  return chat.lorebooks?.find((book) => book.name === PLAYBOOK_BOOK);
}

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

function enableSteps(
  books: readonly OwnLorebook[],
  enabled: (step: number) => boolean,
): readonly OwnLorebook[] {
  return withBook(books, (entries) =>
    entries.map((entry, step) => ({ ...entry, enabled: enabled(step) })),
  );
}

export function startPlaybook(chat: PlaybookChat, playbook: Playbook): PlaybookPatch {
  return {
    playbook: { origin: playbook.origin, id: playbook.id, phase: playbook.phases[0]?.id ?? '' },
    lorebooks: enableSteps(chat.lorebooks ?? [], (step) => step === 0),
  };
}

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

export function currentPhase(state: ChatPlaybook): PlaybookPhase | undefined {
  const phases = state.playbook.phases;
  return phases.find((phase) => phase.id === state.phase) ?? phases[0];
}

export function outlineSteps(chat: Pick<Chat, 'lorebooks'>): readonly LoreEntry[] {
  return playbookBook(chat)?.entries ?? [];
}

export function currentStep(chat: Pick<Chat, 'lorebooks'>): number | null {
  const at = outlineSteps(chat).findIndex((entry) => entry.enabled);
  return at < 0 ? null : at;
}

function withSteps(chat: PlaybookChat, enabled: (step: number) => boolean): PlaybookPatch | null {
  if (chat.playbook === undefined || outlineSteps(chat).length === 0) return null;
  return { playbook: chat.playbook, lorebooks: enableSteps(chat.lorebooks ?? [], enabled) };
}

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

export function stepTitle(entry: Pick<LoreEntry, 'comment' | 'content'>): string {
  const comment = entry.comment.trim();
  return comment.length > 0 ? comment : (entry.content.trim().split('\n')[0] ?? '').trim();
}

export function withStep(chat: PlaybookChat, index: number): PlaybookPatch | null {
  if (index < 0 || index >= outlineSteps(chat).length) return null;
  return withSteps(chat, (at) => at === index);
}

export function nextStep(chat: PlaybookChat): PlaybookPatch | null {
  const current = currentStep(chat);
  return current === null ? null : withStep(chat, current + 1);
}

export function prevStep(chat: PlaybookChat): PlaybookPatch | null {
  const current = currentStep(chat);
  return current === null ? null : withStep(chat, current - 1);
}

export function withAllSteps(chat: PlaybookChat): PlaybookPatch | null {
  return withSteps(chat, () => true);
}

export function toggleStep(chat: PlaybookChat, index: number): PlaybookPatch | null {
  const steps = outlineSteps(chat);
  if (index < 0 || index >= steps.length) return null;
  return withSteps(chat, (at) => (steps[at]?.enabled === true) !== (at === index));
}

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

function nextStepTitle(chat: Pick<Chat, 'lorebooks'>): string | null {
  const at = currentStep(chat);
  const next = at === null ? undefined : outlineSteps(chat)[at + 1];
  return next === undefined ? null : stepTitle(next);
}

export function withNextStepTitle(
  text: string,
  chat: Pick<Chat, 'lorebooks'>,
  fallback: string,
): string {
  if (!/\{\{nextStep\}\}/iu.test(text)) return text;
  const title = nextStepTitle(chat) ?? fallback;
  return text.replace(/\{\{nextStep\}\}/giu, () => title);
}
