import type { ReconnectPolicy } from '@/port/connection';

// ─────────────────────────────
// 通知の口の張り直しの決まり。諦めるまでの回数と間隔は「タイムアウト」と知らせるまでの時間を
// 決める製品の決まりなので、ここで持ち、通信の層へは口を開くときに渡す。
// ─────────────────────────────

/**
 * 再接続を諦めるまでの回数。**諦めたら切断のまま**にし、押せば張り直せるようにする。
 * 無制限に試し続けると、届いていないことが状態に表れない。
 */
export const RECONNECT_ATTEMPTS = 10;

/**
 * 実行中・待機のものがある間に、開いていた口が切れてよい回数。届いたら切断扱いにして、
 * 「再接続」を押すまで張り直さない。接続するたびに 0 から数える
 */
export const RUN_DROP_LIMIT = 5;

/**
 * 張り直しの決まり。待ち 0.5・1・2・4・5…秒（計 37.5 秒）と、1 回あたり開くまで最大 5 秒（計 50 秒）で、
 * **切れてから諦めるまでを約 90 秒以内**に収める
 */
export const RECONNECT_POLICY: ReconnectPolicy = {
  baseDelayMs: 500,
  maxDelayMs: 5_000,
  maxAttempts: RECONNECT_ATTEMPTS,
  openTimeoutMs: 5_000,
  maxDrops: RUN_DROP_LIMIT,
};
