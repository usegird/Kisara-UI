// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseHistory } from '@/comfy/schema';
import { connectComfySocket, type SocketHandlers } from '@/comfy/ws';
import { t } from '@/i18n';
import { RECONNECT_POLICY } from '@/queue/reconnect-policy';
import { installFaultHandlers, useFaultStore } from '@/store/use-fault-store';

// ─────────────────────────────
// 通信の層が閉じ込めた失敗は場所を符号で渡し、帯の文は画面の側が訳す（文は前と同じ）
// ─────────────────────────────

let stop: () => void = () => undefined;

beforeEach(() => {
  useFaultStore.getState().clear();
  stop = installFaultHandlers(window);
  // ブラウザの reportError と同じく、window の error に届ける
  vi.stubGlobal('reportError', (error: unknown) => {
    window.dispatchEvent(new ErrorEvent('error', { error }));
  });
});

afterEach(() => {
  stop();
  vi.unstubAllGlobals();
});

async function latestFault(): Promise<string | undefined> {
  await Promise.resolve();
  return useFaultStore.getState().faults[0]?.message;
}

describe('通信の層の想定外の失敗の帯', () => {
  it('履歴の 1 件が読めなければ、訳した場所の名前を添える', async () => {
    const broken = {
      get status(): never {
        throw new Error('boom');
      },
    };
    parseHistory({ p1: broken });

    expect(await latestFault()).toBe(`${t('fault.where.history', { id: 'p1' })}: boom`);
  });

  it('通知の 1 通を受けられなければ、訳した場所の名前を添える', async () => {
    const received: SocketHandlers[] = [];
    const socket = connectComfySocket({
      reconnect: { ...RECONNECT_POLICY, openTimeoutMs: null },
      url: 'ws://127.0.0.1:8188/ws',
      onEvent: () => {
        throw new Error('boom');
      },
      onStatus: () => undefined,
      factory: (_url, given) => {
        received.push(given);
        return { close: () => undefined };
      },
    });
    received[0]?.onOpen();
    received[0]?.onMessage(
      JSON.stringify({ type: 'executing', data: { node: null, prompt_id: 'p' } }),
    );
    socket.close();

    expect(await latestFault()).toBe(`${t('fault.where.notification')}: boom`);
  });
});
