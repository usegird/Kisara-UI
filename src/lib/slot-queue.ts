interface SlotQueue {
  readonly request: (onGrant: () => void) => () => void;
  readonly hold: () => () => void;
}

export function createSlotQueue(limit: number): SlotQueue {
  let running = 0;
  let holds = 0;
  const waiting: Array<() => void> = [];

  const next = (): void => {
    while (running < limit && holds === 0) {
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
    hold: () => {
      holds += 1;
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holds -= 1;
        next();
      };
    },
  };
}
