import { beforeEach, describe, expect, it } from 'vitest';

import { useAppValuesStore } from '@/store/use-app-values-store';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// アプリ入力の値（カードには書き戻さない。保存のとき `extra.kisara.values` に書く）。
// 取り込みボタンで既存の値を上書きするので、**Ctrl+Z で1手戻せる**必要がある。
// ─────────────────────────────

beforeEach(() => {
  useAppValuesStore.getState().clear();
});

describe('アプリ入力の値', () => {
  it('空にすると上書きを取り消す', () => {
    useAppValuesStore.getState().setValue('3', 'text', 'hello');
    expect(useAppValuesStore.getState().values.get('3')).toEqual({ text: 'hello' });

    useAppValuesStore.getState().setValue('3', 'text', '');
    expect(useAppValuesStore.getState().values.has('3')).toBe(false);
  });

  it('Ctrl+Z 相当で1手ずつ戻せる', () => {
    const store = useAppValuesStore.getState();
    expect(store.canUndo()).toBe(false);

    store.setValue('3', 'text', 'a');
    store.setValue('3', 'text', 'b');
    expect(useAppValuesStore.getState().values.get('3')).toEqual({ text: 'b' });

    expect(useAppValuesStore.getState().undo()).toBe(true);
    expect(useAppValuesStore.getState().values.get('3')).toEqual({ text: 'a' });

    expect(useAppValuesStore.getState().undo()).toBe(true);
    expect(useAppValuesStore.getState().values.has('3')).toBe(false);

    // これ以上は戻せない
    expect(useAppValuesStore.getState().undo()).toBe(false);
  });

  it('戻した手はやり直せる。新しく値を入れたらやり直しの控えは捨てる', () => {
    const store = useAppValuesStore.getState();
    store.setValue('3', 'text', 'a');
    store.setValue('3', 'text', 'b');
    useAppValuesStore.getState().undo();

    expect(useAppValuesStore.getState().redo()).toBe(true);
    expect(useAppValuesStore.getState().values.get('3')).toEqual({ text: 'b' });
    expect(useAppValuesStore.getState().redo()).toBe(false);

    useAppValuesStore.getState().undo();
    useAppValuesStore.getState().setValue('3', 'text', 'c');
    expect(useAppValuesStore.getState().redo()).toBe(false);
  });

  it('取り込みで上書きしても元の値に戻せる', () => {
    const store = useAppValuesStore.getState();
    store.setValue('3', 'text', '手で入れた値');
    store.setValue('3', 'text', 'カードの値'); // 取り込みボタン相当

    expect(useAppValuesStore.getState().undo()).toBe(true);
    expect(useAppValuesStore.getState().values.get('3')).toEqual({ text: '手で入れた値' });
  });

  it('ワークフローを開き直したら履歴も消える', () => {
    useAppValuesStore.getState().setValue('3', 'text', 'a');
    useAppValuesStore.getState().clear();

    expect(useAppValuesStore.getState().canUndo()).toBe(false);
  });
});
describe('未保存の印', () => {
  beforeEach(() => {
    useGraphStore.getState().loadWorkflow({ nodes: [], links: [] });
  });

  it('値を変える・戻す・やり直すと印を付ける', () => {
    const dirty = (): boolean => useGraphStore.getState().dirty;

    useAppValuesStore.getState().setValue('3', 'text', 'a');
    expect(dirty()).toBe(true);

    useGraphStore.getState().markSaved('x.json', 'http://x');
    useAppValuesStore.getState().undo();
    expect(dirty()).toBe(true);

    useGraphStore.getState().markSaved('x.json', 'http://x');
    useAppValuesStore.getState().redo();
    expect(dirty()).toBe(true);
  });

  it('載せ直し（タブの切り替え・開く）では印を付けない', () => {
    useAppValuesStore.getState().restore(new Map([['3', { text: 'a' }]]));

    expect(useGraphStore.getState().dirty).toBe(false);
  });
});
