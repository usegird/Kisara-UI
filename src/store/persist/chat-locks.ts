import { heldLockNames, holdReleasable } from '@/lib/web-locks';

const CHAT_LOCK_PREFIX = 'kisaraui.chat:';

const held = new Map<string, () => void>();

export async function claimChat(chatId: string): Promise<boolean> {
  if (held.has(chatId)) return true;
  const release = await holdReleasable(`${CHAT_LOCK_PREFIX}${chatId}`);
  if (release === null) return false;
  held.set(chatId, release);
  return true;
}

export function releaseChat(chatId: string): void {
  held.get(chatId)?.();
  held.delete(chatId);
}

export async function openElsewhere(chatId: string): Promise<boolean> {
  if (held.has(chatId)) return false;
  return (await chatsOpenElsewhere([chatId])).has(chatId);
}

export async function chatsOpenElsewhere(ids: readonly string[]): Promise<Set<string>> {
  try {
    const names = await heldLockNames();
    if (names === null) return new Set();
    return new Set(ids.filter((id) => !held.has(id) && names.has(`${CHAT_LOCK_PREFIX}${id}`)));
  } catch {
    return new Set();
  }
}
