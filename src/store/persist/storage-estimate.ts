import { useChatStore } from '@/store/use-chat-store';

const NEAR_FULL_RATIO = 0.8;

const ESTIMATE_INTERVAL = 30_000;

let persistAsked = false;

let lastEstimate = 0;

export async function ensurePersisted(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  const storage = typeof navigator === 'undefined' ? undefined : navigator.storage;
  try {
    if (storage === undefined || (await storage.persisted())) return;
    await storage.persist();
  } catch {
  }
}

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
  }
}
