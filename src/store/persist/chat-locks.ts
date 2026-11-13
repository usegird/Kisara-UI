import { heldLockNames, holdReleasable } from '@/lib/web-locks';

// ─────────────────────────────
// 会話の鍵。会話の id ごとに Web Locks の鍵を持ち、同じ会話を 2 つのブラウザのタブで開かない。
// ─────────────────────────────

const CHAT_LOCK_PREFIX = 'kisaraui.chat:';

/** このブラウザのタブが持つ会話の鍵。放す手続き */
const held = new Map<string, () => void>();

/** 会話の鍵を取る。ほかのブラウザのタブが持っていれば false */
export async function claimChat(chatId: string): Promise<boolean> {
  if (held.has(chatId)) return true;
  const release = await holdReleasable(`${CHAT_LOCK_PREFIX}${chatId}`);
  if (release === null) return false;
  held.set(chatId, release);
  return true;
}

/** 会話の鍵を放す（タブを閉じた・消した・写した） */
export function releaseChat(chatId: string): void {
  held.get(chatId)?.();
  held.delete(chatId);
}

/** ほかのブラウザのタブが開いている会話か */
export async function openElsewhere(chatId: string): Promise<boolean> {
  if (held.has(chatId)) return false;
  return (await chatsOpenElsewhere([chatId])).has(chatId);
}

/** 渡した会話のうち、ほかのブラウザのタブが開いているもの */
export async function chatsOpenElsewhere(ids: readonly string[]): Promise<Set<string>> {
  try {
    const names = await heldLockNames();
    if (names === null) return new Set();
    return new Set(ids.filter((id) => !held.has(id) && names.has(`${CHAT_LOCK_PREFIX}${id}`)));
  } catch {
    return new Set();
  }
}
