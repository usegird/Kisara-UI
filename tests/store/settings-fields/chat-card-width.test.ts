import { describe, expect, it } from 'vitest';

import { CHAT_CARD_WIDTH, normalizeChatCardWidth } from '@/store/settings-fields/chat-card-width';
import { useSettingsStore } from '@/store/use-settings-store';

describe('カードの並びの幅', () => {
  it('読めない値は既定、範囲の外は端に寄せる', () => {
    expect(normalizeChatCardWidth('wide')).toBe(CHAT_CARD_WIDTH.initial);
    expect(normalizeChatCardWidth(10)).toBe(CHAT_CARD_WIDTH.min);
    expect(normalizeChatCardWidth(9999)).toBe(CHAT_CARD_WIDTH.max);
  });

  it('仕切りで動かした分だけ変え、範囲に収める', () => {
    useSettingsStore.setState({ chatCardWidth: CHAT_CARD_WIDTH.initial });
    useSettingsStore.getState().resizeChatCard(32);
    expect(useSettingsStore.getState().chatCardWidth).toBe(CHAT_CARD_WIDTH.initial + 32);
    useSettingsStore.getState().resizeChatCard(-9999);
    expect(useSettingsStore.getState().chatCardWidth).toBe(CHAT_CARD_WIDTH.min);
  });
});
