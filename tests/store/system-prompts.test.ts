import { beforeEach, describe, expect, it } from 'vitest';

import { memoryTable } from '@/store/persist/chat-repo';
import { installSystemPromptTable, useSystemPromptsStore } from '@/store/use-system-prompts-store';

beforeEach(() => {
  installSystemPromptTable(memoryTable());
  useSystemPromptsStore.setState({ templates: {} });
});

describe('テンプレート', () => {
  it('別名保存・上書き保存・削除が置き場に残り、読み戻せる', async () => {
    const store = useSystemPromptsStore.getState();
    const saved = store.add('Terse', 'Be brief.');
    store.update(saved.id, 'Be very brief.', { temperature: 0.5 });
    const other = store.add('Other', 'x');
    store.remove(other.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    useSystemPromptsStore.setState({ templates: {} });
    await useSystemPromptsStore.getState().load();
    const templates = Object.values(useSystemPromptsStore.getState().templates);
    expect(templates.map((item) => [item.name, item.content])).toEqual([
      ['Terse', 'Be very brief.'],
    ]);
    expect(templates[0]?.params).toEqual({ temperature: 0.5 });
  });
});

describe('テンプレートの名前を変える', () => {
  it('同じ 1 件の名前だけを変え、新しく作らない', () => {
    const template = useSystemPromptsStore.getState().add('A', 'body');
    useSystemPromptsStore.getState().rename(template.id, 'B');
    const all = Object.values(useSystemPromptsStore.getState().templates);
    expect(all.map((item) => item.name)).toEqual(['B']);
  });

  it('同じ名前のテンプレートも足せる（id で見分ける）', () => {
    const store = useSystemPromptsStore.getState();
    const first = store.add('A', 'one');
    const second = store.add('A', 'two');
    expect(second.name).toBe('A');
    expect(second.id).not.toBe(first.id);
  });
});
