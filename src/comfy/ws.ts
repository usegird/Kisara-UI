import { parseComfyEvent } from '@/comfy/schema-event';
import { reportFault } from '@/lib/fault';
import type {
  ComfyFaultPlace,
  ReconnectPolicy,
  SocketGiveUp,
  SocketStatus,
} from '@/port/connection';
import type { ComfyEvent } from '@/port/run';

const NOTIFICATION_PLACE: ComfyFaultPlace = { code: 'notification', params: {} };

export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onError: () => void;
  readonly onMessage: (data: unknown) => void;
}

interface SocketLike {
  readonly close: () => void;
}

export type SocketFactory = (url: string, handlers: SocketHandlers) => SocketLike;

export const STABLE_OPEN_MS = 3_000;

interface ComfySocketOptions {
  readonly url: string;
  readonly onEvent: (event: ComfyEvent) => void;
  readonly onStatus: (status: SocketStatus) => void;
  readonly onRetry?: (attempt: number) => void;
  readonly onGiveUp?: (reason: SocketGiveUp) => void;
  readonly countsDrop?: () => boolean;
  readonly factory?: SocketFactory;
  readonly reconnect: ReconnectPolicy;
}

interface ComfySocket {
  readonly status: () => SocketStatus;
  readonly suspect: () => void;
  readonly close: () => void;
}

export function backoffDelay(attempt: number, policy: ReconnectPolicy): number {
  const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

function browserSocketFactory(url: string, handlers: SocketHandlers): SocketLike {
  const socket = new WebSocket(url);

  socket.onopen = () => handlers.onOpen();
  socket.onclose = () => handlers.onClose();
  socket.onerror = () => handlers.onError();
  socket.onmessage = (event: MessageEvent<unknown>) => handlers.onMessage(event.data);

  return { close: () => socket.close() };
}

export function connectComfySocket(options: ComfySocketOptions): ComfySocket {
  const factory = options.factory ?? browserSocketFactory;
  const policy = options.reconnect;

  const status = createStatusCell(options.onStatus);
  let socket: SocketLike | null = null;
  const retries = createRetryCount(policy);
  const reconnectTimer = createTimerSlot();
  const openTimer = createTimerSlot();
  let manuallyClosed = false;
  let dropCurrent: (() => void) | null = null;

  function scheduleReconnect(): void {
    if (manuallyClosed) return;
    const attempt = retries.next();
    if (typeof attempt !== 'number') {
      status.set('closed');
      options.onGiveUp?.(attempt);
      return;
    }
    status.set('reconnecting');
    options.onRetry?.(attempt);
    reconnectTimer.start(open, backoffDelay(attempt, policy));
  }

  function open(): void {
    if (manuallyClosed) return;

    let settled = false;
    let openedAt: number | null = null;

    function fail(): void {
      if (manuallyClosed || settled) return;
      settled = true;
      openTimer.clear();
      retries.fail(openedAt, options.countsDrop);
      scheduleReconnect();
    }

    const current = factory(options.url, {
      onOpen: () => {
        if (manuallyClosed || settled) return;
        openTimer.clear();
        openedAt = Date.now();
        status.set('open');
      },
      onClose: fail,
      onError: () => {
        if (!manuallyClosed && status.current() === 'open') status.set('reconnecting');
      },
      onMessage: (data) => {
        if (manuallyClosed || settled) return;
        deliverMessage(data, options.onEvent);
      },
    });
    socket = current;
    dropCurrent = () => {
      current.close();
      fail();
    };

    if (policy.openTimeoutMs !== null) {
      openTimer.start(() => {
        if (openedAt === null) dropCurrent?.();
      }, policy.openTimeoutMs);
    }
  }

  status.set('connecting');
  open();

  return {
    status: status.current,
    suspect: () => {
      if (manuallyClosed || status.current() !== 'open') return;
      dropCurrent?.();
    },
    close: () => {
      manuallyClosed = true;
      reconnectTimer.clear();
      openTimer.clear();
      socket?.close();
      status.set('closed');
    },
  };
}

interface StatusCell {
  readonly current: () => SocketStatus;
  readonly set: (next: SocketStatus) => void;
}

function createStatusCell(onStatus: (status: SocketStatus) => void): StatusCell {
  let status: SocketStatus = 'closed';
  return {
    current: () => status,
    set: (next) => {
      if (status === next) return;
      status = next;
      onStatus(next);
    },
  };
}

interface TimerSlot {
  readonly start: (run: () => void, ms: number) => void;
  readonly clear: () => void;
}

function createTimerSlot(): TimerSlot {
  let handle: ReturnType<typeof setTimeout> | null = null;
  return {
    start: (run, ms) => {
      handle = setTimeout(run, ms);
    },
    clear: () => {
      if (handle !== null) clearTimeout(handle);
      handle = null;
    },
  };
}

interface RetryCount {
  readonly fail: (openedAt: number | null, countsDrop: (() => boolean) | undefined) => void;
  readonly next: () => number | SocketGiveUp;
}

function createRetryCount(policy: ReconnectPolicy): RetryCount {
  let attempts = 0;
  let drops = 0;
  return {
    fail: (openedAt, countsDrop) => {
      if (openedAt !== null && Date.now() - openedAt >= STABLE_OPEN_MS) attempts = 0;
      if (openedAt !== null && countsDrop?.() === true) drops += 1;
    },
    next: () => {
      if (policy.maxDrops !== null && drops >= policy.maxDrops) return 'drops';
      if (policy.maxAttempts !== null && attempts >= policy.maxAttempts) return 'retries';
      attempts += 1;
      return attempts;
    },
  };
}

function deliverMessage(data: unknown, onEvent: (event: ComfyEvent) => void): void {
  try {
    const event = parseComfyEvent(data);
    if (event) onEvent(event);
  } catch (error) {
    reportFault(NOTIFICATION_PLACE, error);
  }
}
