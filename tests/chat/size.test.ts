import { describe, expect, it } from 'vitest';

import {
  CHAT_LOG_WINDOW_DEFAULT,
  CHAT_MAX_MB_DEFAULT,
  chatBytes,
  chatSizeLevel,
  normalizeChatLogWindow,
  normalizeChatMaxMegabytes,
} from '@/chat/size';
import { approxBytes } from '@/lib/approx-bytes';
import { MEGABYTE } from '@/lib/file-size';

import { chat, chatMessage, chatTurns } from '../helpers/llm';

// ─────────────────────────────
// 会話の大きさの上限と、一度に描く発言の数
// ─────────────────────────────

describe('会話の大きさ', () => {
  it('保存と同じ見積もりで、添えた画像も数える', () => {
    const base = chat(chatTurns(4));
    expect(chatBytes(base)).toBe(approxBytes(base));

    const image = `data:image/png;base64,${'A'.repeat(10_000)}`;
    const withImage = chat([...base.messages, chatMessage('u9', 'user', ['見て'], 0, [image])]);
    expect(chatBytes(withImage) - chatBytes(base)).toBeGreaterThan(10_000);
  });

  it('発言を足しても、変わっていない発言は数え直さず同じ値になる', () => {
    const before = chat(chatTurns(10));
    const after = { ...before, messages: [...before.messages, chatMessage('n', 'user', ['q'])] };
    expect(chatBytes(after)).toBe(approxBytes(after));
  });

  it('上限の 9 割を超えたら注意、上限を超えたら止める', () => {
    expect(chatSizeLevel(9 * MEGABYTE, 10)).toBe('ok');
    expect(chatSizeLevel(9 * MEGABYTE + 1, 10)).toBe('near');
    expect(chatSizeLevel(10 * MEGABYTE, 10)).toBe('near');
    expect(chatSizeLevel(10 * MEGABYTE + 1, 10)).toBe('full');
  });
});

describe('設定の値', () => {
  it('読めない値は既定にし、範囲に収めて整数にする', () => {
    expect(normalizeChatMaxMegabytes('x')).toBe(CHAT_MAX_MB_DEFAULT);
    expect(normalizeChatMaxMegabytes(0)).toBe(1);
    expect(normalizeChatMaxMegabytes(12.6)).toBe(13);
    expect(normalizeChatLogWindow(undefined)).toBe(CHAT_LOG_WINDOW_DEFAULT);
    expect(normalizeChatLogWindow(5)).toBe(20);
  });
});
