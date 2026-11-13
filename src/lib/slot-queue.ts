// ─────────────────────────────
// 同時に走らせる数を絞る順番待ち（汎用）。枠が空いた順に、頼んだ順で知らせる。
// 頼んだ側は、返った手続きで枠を返す（まだ待っていれば待ちから抜ける）。何度呼んでもよい。
// ─────────────────────────────

/** 同時に走らせる数を絞る順番待ち */
interface SlotQueue {
  /** 枠を頼む。枠が取れたら `onGrant` を呼ぶ（空いていればその場で）。返り値で返す・やめる */
  readonly request: (onGrant: () => void) => () => void;
}

/** 同時に `limit` 個まで走らせる順番待ちを作る */
export function createSlotQueue(limit: number): SlotQueue {
  let running = 0;
  const waiting: Array<() => void> = [];

  const next = (): void => {
    while (running < limit) {
      const grant = waiting.shift();
      if (grant === undefined) return;
      running += 1;
      grant();
    }
  };

  return {
    request: (onGrant) => {
      let state: 'waiting' | 'running' | 'done' = 'waiting';
      const grant = (): void => {
        state = 'running';
        onGrant();
      };
      waiting.push(grant);
      next();
      return () => {
        if (state === 'waiting') {
          const at = waiting.indexOf(grant);
          if (at >= 0) waiting.splice(at, 1);
        } else if (state === 'running') {
          running -= 1;
          next();
        }
        state = 'done';
      };
    },
  };
}
