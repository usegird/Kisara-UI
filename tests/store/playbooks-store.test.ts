import { afterEach, describe, expect, it } from 'vitest';

import { memoryTable } from '@/store/persist/chat-repo';
import { installPlaybookTable, usePlaybooksStore } from '@/store/use-playbooks-store';
import { useSettingsStore } from '@/store/use-settings-store';

afterEach(() => {
  installPlaybookTable(null);
  usePlaybooksStore.setState({ playbooks: {}, loaded: false });
  useSettingsStore.setState({ playbooksHidden: [] });
});

describe('外した鍵の掃除', () => {
  it('読み戻したら、無い自分のプレイブックの鍵だけを外し、標準の鍵は残す', async () => {
    installPlaybookTable(memoryTable());
    useSettingsStore.setState({ playbooksHidden: ['builtin:story', 'own:gone'] });

    await usePlaybooksStore.getState().load();

    expect(useSettingsStore.getState().playbooksHidden).toEqual(['builtin:story']);
  });
});
