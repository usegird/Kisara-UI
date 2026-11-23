// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRecord } from '@/lib/guards';
import { holdSettingsWrites, SETTINGS_KEY, useSettingsStore } from '@/store/use-settings-store';

afterEach(() => vi.restoreAllMocks());

function settingsWrites(spy: { readonly mock: { readonly calls: string[][] } }): string[] {
  return spy.mock.calls.flatMap(([key, value]) => (key === SETTINGS_KEY ? [value ?? ''] : []));
}

describe('設定を書くのを止める', () => {
  it('止めている間は書かず、再開したら最後の値を 1 回書く', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const resume = holdSettingsWrites();
    for (let width = 300; width < 330; width += 1) {
      useSettingsStore.getState().setChatImageSize(width, 400);
    }
    expect(settingsWrites(spy)).toHaveLength(0);

    resume();
    const writes = settingsWrites(spy);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!)).toHaveProperty(
      ['state', 'chatImageWidth'],
      useSettingsStore.getState().chatImageWidth,
    );

    resume();
    useSettingsStore.getState().setChatImageSize(340, 400);
    expect(settingsWrites(spy)).toHaveLength(2);
  });

  it('書くときは、ほかのタブが変えた項目を消さずに、このタブで変えた項目だけを重ねる', () => {
    useSettingsStore.getState().setChatImageSize(300, 400);
    const stored: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    if (!isRecord(stored) || !isRecord(stored.state)) throw new Error('no settings');
    const state = { ...stored.state, llmSystemPrompt: 'from other tab' };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...stored, state }));

    useSettingsStore.getState().setChatImageSize(360, 400);

    const written: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    expect(written).toHaveProperty(['state', 'llmSystemPrompt'], 'from other tab');
    expect(written).toHaveProperty(['state', 'chatImageWidth'], 360);
  });

  it('重ねて止めたら、全部を再開したときに書く', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem');
    const first = holdSettingsWrites();
    const second = holdSettingsWrites();
    useSettingsStore.getState().setChatImageSize(350, 400);
    first();
    expect(settingsWrites(spy)).toHaveLength(0);
    second();
    expect(settingsWrites(spy)).toHaveLength(1);
  });
});
