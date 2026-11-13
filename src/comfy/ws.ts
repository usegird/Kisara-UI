import { parseComfyEvent } from '@/comfy/schema-event';
import { reportFault } from '@/lib/fault';
import type {
  ComfyFaultPlace,
  ReconnectPolicy,
  SocketGiveUp,
  SocketStatus,
} from '@/port/connection';
import type { ComfyEvent } from '@/port/run';

// ─────────────────────────────
// `/ws` の購読。再接続と切断表示を必ず持つ。WebSocket 実装は差し替え可能にして、テストを実接続なしで回す。
// ─────────────────────────────

/** 読めない通知を知らせるときの場所の符号 */
const NOTIFICATION_PLACE: ComfyFaultPlace = { code: 'notification', params: {} };

/** 差し替えた WebSocket から受け取る出来事 */
export interface SocketHandlers {
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onError: () => void;
  readonly onMessage: (data: unknown) => void;
}

/** WebSocket のうち、購読が使う閉じる操作だけの形 */
interface SocketLike {
  readonly close: () => void;
}

/** URL と受け口から WebSocket を開く関数（テストで差し替える） */
export type SocketFactory = (url: string, handlers: SocketHandlers) => SocketLike;

/**
 * 「繋がった」と数える最短の時間。
 * 開いた直後に切れる相手（前段が受けてから落とす構成）では、
 * 開いたことで回数を戻すと**永久に試し続ける**ので、続いた時間で判断する。
 */
export const STABLE_OPEN_MS = 3_000;

/** 購読を始めるときの指定。通知と状態の受け口と、張り直しの決まり */
interface ComfySocketOptions {
  readonly url: string;
  readonly onEvent: (event: ComfyEvent) => void;
  readonly onStatus: (status: SocketStatus) => void;
  /** 張り直しを始めるたびに、何回目か（1 始まり）を知らせる */
  readonly onRetry?: (attempt: number) => void;
  /** 回数を使い切って諦めたとき（タイムアウト・切断扱い）。手で閉じたときは呼ばない */
  readonly onGiveUp?: (reason: SocketGiveUp) => void;
  /** 開いていた口が切れたとき、その切れを数えるか（`maxDrops`）。省くと数えない */
  readonly countsDrop?: () => boolean;
  readonly factory?: SocketFactory;
  /**
   * 張り直しの決まり。決めるのは呼ぶ側
   */
  readonly reconnect: ReconnectPolicy;
}

/** 購読中の口。今の状態を読み、疑う・閉じる */
interface ComfySocket {
  readonly status: () => SocketStatus;
  /**
   * 開いているはずの口を疑う（ほかの経路で相手が応答しないと分かったとき）。
   * **切れたことが届かない口**がある（中継が接続を持ったままにする構成）ので、
   * 閉じて失敗と数え、張り直しを始める。開いていなければ何もしない
   */
  readonly suspect: () => void;
  /** 手動切断。以降は再接続しない */
  readonly close: () => void;
}

/** 何回目の張り直しかから、待つ時間（ミリ秒）を出す。倍々に伸ばし、上限で止める */
export function backoffDelay(attempt: number, policy: ReconnectPolicy): number {
  const delay = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(delay, policy.maxDelayMs);
}

/** ブラウザの WebSocket を SocketLike に合わせる薄いアダプタ */
function browserSocketFactory(url: string, handlers: SocketHandlers): SocketLike {
  const socket = new WebSocket(url);

  socket.onopen = () => handlers.onOpen();
  socket.onclose = () => handlers.onClose();
  socket.onerror = () => handlers.onError();
  socket.onmessage = (event: MessageEvent<unknown>) => handlers.onMessage(event.data);

  return { close: () => socket.close() };
}

/** `/ws` を開いて通知を購読する。切れたら決まりに従って張り直し、使い切ったら諦めを知らせる */
export function connectComfySocket(options: ComfySocketOptions): ComfySocket {
  const factory = options.factory ?? browserSocketFactory;
  const policy = options.reconnect;

  const status = createStatusCell(options.onStatus);
  let socket: SocketLike | null = null;
  const retries = createRetryCount(policy);
  const reconnectTimer = createTimerSlot();
  const openTimer = createTimerSlot();
  let manuallyClosed = false;
  /** いまの口を失敗として閉じる。口ごとに差し替わる */
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
        // 閉じたあと・見切ったあとに遅れて届く通知で状態を塗り替えない
        if (manuallyClosed || settled) return;
        openTimer.clear();
        openedAt = Date.now();
        status.set('open');
      },
      onClose: fail,
      onError: () => {
        // onerror の直後に onclose が来る実装もあるため、ここでは状態だけ落とす
        if (!manuallyClosed && status.current() === 'open') status.set('reconnecting');
      },
      onMessage: (data) => {
        // 見切った口に遅れて届いたものは読まない
        if (manuallyClosed || settled) return;
        deliverMessage(data, options.onEvent);
      },
    });
    socket = current;
    dropCurrent = () => {
      current.close();
      fail();
    };

    // 開くまで待ち続けない。見切ったら閉じて、失敗として数える
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

/** 今の状態と、変わったときだけ知らせる書き込み */
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

/** 1 つずつ待つタイマー（張り直しの待ち・開くまでの見切り） */
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

/** 張り直しの回数の数え方 */
interface RetryCount {
  /** 口が切れた。`openedAt` は開いた時刻（開かずに終わったなら null） */
  readonly fail: (openedAt: number | null, countsDrop: (() => boolean) | undefined) => void;
  /** 次の張り直しが何回目か（1 始まり）。使い切っていたら諦める理由 */
  readonly next: () => number | SocketGiveUp;
}

function createRetryCount(policy: ReconnectPolicy): RetryCount {
  let attempts = 0;
  /** 開いていた口が切れた回数（`countsDrop` が数えると言った分）。回数のように戻さない */
  let drops = 0;
  return {
    fail: (openedAt, countsDrop) => {
      // しばらく続いた接続だけを「繋がった」と数え、回数を戻す
      if (openedAt !== null && Date.now() - openedAt >= STABLE_OPEN_MS) attempts = 0;
      // 開いていた口の切れは、戻す回数とは別に数える（落ちては上がる相手に張り直し続けない）
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

/** 通知を 1 通読んで渡す。1 通ずつ閉じ込め、読めない通知で接続ごと止めない */
function deliverMessage(data: unknown, onEvent: (event: ComfyEvent) => void): void {
  try {
    const event = parseComfyEvent(data);
    if (event) onEvent(event);
  } catch (error) {
    // 通信の層は文言の表を読まないので、場所は符号で渡す（帯の文は画面の側が引く）
    reportFault(NOTIFICATION_PLACE, error);
  }
}
