import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// 保存領域を消さないよう頼むことと、使った量の確かめ。
// ─────────────────────────────

/**
 * 使った量がこの割合を超えたら注意を出す
 */
const NEAR_FULL_RATIO = 0.8;

/** 使った量を確かめる間隔の下限（ms） */
const ESTIMATE_INTERVAL = 30_000;

let persistAsked = false;

let lastEstimate = 0;

/**
 * 会話を消さないよう頼む（`navigator.storage.persist()`）。1 回の読み込みで 1 回だけ。
 * 許されていれば頼まない。断られても続ける
 */
export async function ensurePersisted(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  try {
    if (storage === undefined || (await storage.persisted())) return;
    await storage.persist();
  } catch {
    // 頼めない環境でも続ける
  }
}

/** ブラウザの置き場の使った量を確かめ、上限の 80% を超えていれば注意を出す */
export async function checkStorageUsage(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastEstimate < ESTIMATE_INTERVAL) return;
  lastEstimate = now;
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  try {
    const estimate = await storage?.estimate();
    if (estimate?.usage === undefined || estimate.quota === undefined || estimate.quota <= 0) {
      return;
    }
    useChatStore.getState().setNearFull(estimate.usage / estimate.quota > NEAR_FULL_RATIO);
  } catch {
    // 量が取れない環境では注意を出さない
  }
}
