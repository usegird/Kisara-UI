import { describe, expect, it } from 'vitest';

import { connectionStatusView, retryCount, retryNotice } from '@/queue/connection-status';

// ─────────────────────────────
// 接続ステータスの見せ方。
// **HTTP は通っているが進捗（WS）が来ない**状態を「接続済み」で塗り潰さないこと。
// ─────────────────────────────

describe('接続ステータス', () => {
  it('未接続・接続中・失敗をそれぞれ区別する', () => {
    expect(connectionStatusView('disconnected', 'closed')).toEqual({
      tone: 'off',
      label: '未接続',
      detail: null,
    });
    expect(connectionStatusView('connecting', 'closed').tone).toBe('busy');
    expect(connectionStatusView('failed', 'closed').tone).toBe('error');
  });

  it('進捗まで届いていれば ok', () => {
    const view = connectionStatusView('connected', 'open');

    expect(view.tone).toBe('ok');
    expect(view.detail).toBe('進捗: 受信中');
  });

  it('接続済みでも進捗が来ていなければ警告として出す', () => {
    for (const socket of ['connecting', 'reconnecting'] as const) {
      const view = connectionStatusView('connected', socket);

      expect(view.tone, socket).toBe('warn');
      expect(view.label, socket).toBe('接続済み');
      expect(view.detail, socket).not.toBeNull();
    }
  });

  it('再接続を諦めたら、再接続中と分けてエラーにする', () => {
    const view = connectionStatusView('connected', 'closed');

    expect(view.tone).toBe('error');
    expect(view.detail).toContain('10 回');
  });

  it('実行中に切れ続けて切断扱いにしたときは、切れた回数と再接続を案内する', () => {
    const view = connectionStatusView('connected', 'closed', 0, 'drops');

    expect(view.tone).toBe('error');
    expect(view.detail).toContain('5 回');
    expect(view.detail).toContain('再接続');
  });

  it('3 回目までは再接続中とだけ出し、4 回目から応答なしリトライ（n/10）を出す', () => {
    expect(retryNotice('reconnecting', 3)).toBeNull();
    expect(retryNotice('reconnecting', 4)).toBe('応答なしリトライ (4/10)');
    expect(retryNotice('reconnecting', 10)).toBe('応答なしリトライ (10/10)');
    expect(retryNotice('open', 5)).toBeNull();
    // タスクのカードには回数だけ
    expect(retryCount('reconnecting', 4)).toBe('リトライ (4/10)');
    expect(retryCount('reconnecting', 3)).toBeNull();

    expect(connectionStatusView('connected', 'reconnecting', 3).label).toBe('接続済み');
    const view = connectionStatusView('connected', 'reconnecting', 4);
    expect(view.label).toBe('応答なしリトライ (4/10)');
    expect(view.tone).toBe('warn');
  });

  it('諦めたらタイムアウトと出す', () => {
    expect(connectionStatusView('connected', 'closed').label).toBe('タイムアウト');
  });

  it('進捗の状態は文言で区別できる', () => {
    const detail = (socket: 'closed' | 'reconnecting') =>
      connectionStatusView('connected', socket).detail;

    expect(detail('closed')).not.toBe(detail('reconnecting'));
  });
});
