import type { ReconnectPolicy } from '@/port/connection';

export const RECONNECT_ATTEMPTS = 10;

export const RUN_DROP_LIMIT = 5;

export const RECONNECT_POLICY: ReconnectPolicy = {
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  maxAttempts: RECONNECT_ATTEMPTS,
  openTimeoutMs: 5_000,
  maxDrops: RUN_DROP_LIMIT,
};
