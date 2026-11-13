import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  backoffDelay,
  connectComfySocket,
  STABLE_OPEN_MS,
  type SocketFactory,
  type SocketHandlers,
} from '@/comfy/ws';
import type { SocketStatus } from '@/port/connection';
import type { ComfyEvent } from '@/port/run';
import { RECONNECT_ATTEMPTS, RECONNECT_POLICY, RUN_DROP_LIMIT } from '@/queue/reconnect-policy';

interface FakeSocket {
  readonly handlers: SocketHandlers;
  closed: boolean;
}

function fakeFactory(): { factory: SocketFactory; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = (_url, handlers) => {
    const socket: FakeSocket = { handlers, closed: false };
    sockets.push(socket);
    return {
      close: () => {
        socket.closed = true;
      },
    };
  };
  return { factory, sockets };
}

/** 回数だけを確かめるときの方針。開くまでの見切りを外す（時間で失敗が増えないように） */
const COUNT_ONLY = { ...RECONNECT_POLICY, openTimeoutMs: null };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WebSocket 購読', () => {
  it('バックオフは指数的に伸び、上限で頭打ちになる', () => {
    expect(backoffDelay(1, RECONNECT_POLICY)).toBe(500);
    expect(backoffDelay(2, RECONNECT_POLICY)).toBe(1000);
    expect(backoffDelay(3, RECONNECT_POLICY)).toBe(2000);
    expect(backoffDelay(10, RECONNECT_POLICY)).toBe(RECONNECT_POLICY.maxDelayMs);
  });

  it('接続・切断・再接続の状態を通知する', () => {
    const { factory, sockets } = fakeFactory();
    const statuses: SocketStatus[] = [];

    connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: (status) => statuses.push(status),
      factory,
    });

    expect(statuses).toEqual(['connecting']);
    sockets[0]?.handlers.onOpen();
    expect(statuses).toEqual(['connecting', 'open']);

    sockets[0]?.handlers.onClose();
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting']);

    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]?.handlers.onOpen();
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'open']);
  });

  it('再接続の間隔が伸びる', () => {
    const { factory, sockets } = fakeFactory();
    connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      factory,
    });

    sockets[0]?.handlers.onClose();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);

    sockets[1]?.handlers.onClose();
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2); // まだ足りない
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(3);
  });

  it('10 回で諦め、切断のまま止まる', () => {
    const { factory, sockets } = fakeFactory();
    const statuses: SocketStatus[] = [];
    const socket = connectComfySocket({
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: (status) => statuses.push(status),
      factory,
      reconnect: COUNT_ONLY,
    });

    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt += 1) {
      sockets.at(-1)?.handlers.onClose();
      vi.advanceTimersByTime(60_000);
    }
    // 張り直しは 10 回まで（最初の 1 本を含めて 11 本）
    expect(sockets).toHaveLength(RECONNECT_ATTEMPTS + 1);

    sockets.at(-1)?.handlers.onClose();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(RECONNECT_ATTEMPTS + 1);
    expect(socket.status()).toBe('closed');
    expect(statuses.at(-1)).toBe('closed');
  });

  it('張り直すたびに何回目かを知らせ、諦めたときだけ諦めを知らせる', () => {
    const { factory, sockets } = fakeFactory();
    const retries: number[] = [];
    const onGiveUp = vi.fn();
    const socket = connectComfySocket({
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      onRetry: (attempt) => retries.push(attempt),
      onGiveUp,
      factory,
      reconnect: COUNT_ONLY,
    });

    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt += 1) {
      sockets.at(-1)?.handlers.onClose();
      vi.advanceTimersByTime(60_000);
    }
    expect(retries).toEqual(Array.from({ length: RECONNECT_ATTEMPTS }, (_, i) => i + 1));
    expect(onGiveUp).not.toHaveBeenCalled();

    sockets.at(-1)?.handlers.onClose();
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    expect(onGiveUp).toHaveBeenCalledWith('retries');

    // 手で閉じたのは諦めではない
    socket.close();
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('開かないまま待たされたら見切って、失敗として数える', () => {
    const { factory, sockets } = fakeFactory();
    const statuses: SocketStatus[] = [];
    connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: (status) => statuses.push(status),
      factory,
    });

    vi.advanceTimersByTime(4_999);
    expect(statuses).toEqual(['connecting']);
    vi.advanceTimersByTime(1);
    expect(sockets[0]?.closed).toBe(true);
    expect(statuses.at(-1)).toBe('reconnecting');

    // 見切ったあとに遅れて開いても、開通にしない
    sockets[0]?.handlers.onOpen();
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('相手が応答しなくても、切れてから約 90 秒で諦める', () => {
    const { factory, sockets } = fakeFactory();
    const onGiveUp = vi.fn();
    connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      onGiveUp,
      factory,
    });

    // 繋がっていた口が切れ、張り直し 10 本がどれも開かないまま待たされる
    sockets[0]?.handlers.onOpen();
    sockets[0]?.handlers.onClose();
    // 待ち 37.5 秒 ＋ 見切り 5 秒 × 10 回 ＝ 87.5 秒。早すぎもしない
    vi.advanceTimersByTime(87_000);
    expect(onGiveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('数えると言われた切れが上限に届いたら、しばらく続いた接続でも諦める（切断扱い）', () => {
    const { factory, sockets } = fakeFactory();
    const onGiveUp = vi.fn();
    let counting = false;
    const socket = connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      onGiveUp,
      countsDrop: () => counting,
      factory,
    });

    /** 開いて、しばらく続いてから切れる（回数は戻る） */
    const dropAfterStable = (): void => {
      sockets.at(-1)?.handlers.onOpen();
      vi.advanceTimersByTime(STABLE_OPEN_MS);
      sockets.at(-1)?.handlers.onClose();
      vi.advanceTimersByTime(10_000);
    };

    // 数えないと言われた切れ（何もしていない間）は、いくら続いても諦めない
    for (let index = 0; index < RUN_DROP_LIMIT * 2; index += 1) dropAfterStable();
    expect(onGiveUp).not.toHaveBeenCalled();

    counting = true;
    for (let index = 0; index < RUN_DROP_LIMIT - 1; index += 1) dropAfterStable();
    expect(onGiveUp).not.toHaveBeenCalled();
    const opened = sockets.length;
    dropAfterStable();
    expect(onGiveUp).toHaveBeenCalledWith('drops');
    // 諦めたら張り直さない
    expect(sockets).toHaveLength(opened);
    expect(socket.status()).toBe('closed');
  });

  it('疑われたら、開いている口を閉じて張り直す。開いていなければ何もしない', () => {
    const { factory, sockets } = fakeFactory();
    const retries: number[] = [];
    const socket = connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      onRetry: (attempt) => retries.push(attempt),
      factory,
    });

    // 開く前は疑わない（開くまでの見切りに任せる）
    socket.suspect();
    expect(retries).toEqual([]);

    sockets[0]?.handlers.onOpen();
    socket.suspect();
    expect(sockets[0]?.closed).toBe(true);
    expect(socket.status()).toBe('reconnecting');
    expect(retries).toEqual([1]);

    // 張り直している間に重ねて疑っても、回数を進めない
    socket.suspect();
    expect(retries).toEqual([1]);
  });

  it('すぐ切れる接続は「繋がった」と数えない（永久に試し続けない）', () => {
    const { factory, sockets } = fakeFactory();
    connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      factory,
    });

    // 開いてはすぐ切れる相手。回数が戻らないので、いずれ打ち切られる
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS + 5; attempt += 1) {
      sockets.at(-1)?.handlers.onOpen();
      sockets.at(-1)?.handlers.onClose();
      vi.advanceTimersByTime(60_000);
    }
    expect(sockets).toHaveLength(RECONNECT_ATTEMPTS + 1);
  });

  it('しばらく続いた接続のあとは、また 10 回試せる', () => {
    const { factory, sockets } = fakeFactory();
    connectComfySocket({
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      factory,
      reconnect: COUNT_ONLY,
    });

    // 先に何度か失敗させておく
    for (let attempt = 0; attempt < 5; attempt += 1) {
      sockets.at(-1)?.handlers.onClose();
      vi.advanceTimersByTime(60_000);
    }
    const before = sockets.length;

    // しばらく続いた接続で数え直し
    sockets.at(-1)?.handlers.onOpen();
    vi.advanceTimersByTime(STABLE_OPEN_MS);
    sockets.at(-1)?.handlers.onClose();
    vi.advanceTimersByTime(60_000);

    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt += 1) {
      sockets.at(-1)?.handlers.onClose();
      vi.advanceTimersByTime(60_000);
    }
    // 数え直したので、ここからさらに 10 本張り直せる
    expect(sockets).toHaveLength(before + RECONNECT_ATTEMPTS);
  });

  it('閉じたあとに遅れて届く通知で状態を塗り替えない', () => {
    const { factory, sockets } = fakeFactory();
    const statuses: SocketStatus[] = [];
    const socket = connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: (status) => statuses.push(status),
      factory,
    });

    socket.close();
    sockets[0]?.handlers.onOpen();

    expect(statuses.at(-1)).toBe('closed');
    expect(socket.status()).toBe('closed');
  });

  it('手動切断のあとは再接続しない', () => {
    const { factory, sockets } = fakeFactory();
    const socket = connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      factory,
    });

    socket.close();
    expect(socket.status()).toBe('closed');
    expect(sockets[0]?.closed).toBe(true);

    sockets[0]?.handlers.onClose();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
  });

  it('再試行回数の上限に達したら閉じる', () => {
    const { factory, sockets } = fakeFactory();
    const socket = connectComfySocket({
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => undefined,
      onStatus: () => undefined,
      factory,
      reconnect: {
        baseDelayMs: 100,
        maxDelayMs: 100,
        maxAttempts: 1,
        openTimeoutMs: null,
        maxDrops: null,
      },
    });

    sockets[0]?.handlers.onClose();
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);

    sockets[1]?.handlers.onClose();
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    expect(socket.status()).toBe('closed');
  });

  it('メッセージを解釈してイベントとして渡す', () => {
    const { factory, sockets } = fakeFactory();
    const events: ComfyEvent[] = [];

    connectComfySocket({
      reconnect: RECONNECT_POLICY,
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: (event) => events.push(event),
      onStatus: () => undefined,
      factory,
    });

    sockets[0]?.handlers.onMessage(
      JSON.stringify({ type: 'executing', data: { node: '3', prompt_id: 'p1' } }),
    );
    sockets[0]?.handlers.onMessage(new Uint8Array([1, 2])); // プレビュー画像は無視

    expect(events).toEqual([{ type: 'executing', promptId: 'p1', node: '3', displayNode: null }]);
  });
});
