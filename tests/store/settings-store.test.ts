import { describe, expect, it } from 'vitest';

import { useConnectionStore } from '@/store/use-connection-store';
import { clientIdReady, useSettingsStore } from '@/store/use-settings-store';

describe('設定ストア', () => {
  it('接続先は前後の空白を落として保持する', () => {
    useSettingsStore.getState().setBaseUrl('  http://127.0.0.1:8188  ');
    expect(useSettingsStore.getState().baseUrl).toBe('http://127.0.0.1:8188');
  });

  it('接続先は末尾の / を落として保持する', () => {
    useSettingsStore.getState().setBaseUrl('http://127.0.0.1:8188/');
    expect(useSettingsStore.getState().baseUrl).toBe('http://127.0.0.1:8188');
  });

  it('clientId はタブごとに決まり、決まったら入る', async () => {
    const clientId = await clientIdReady;
    // 英小文字と数字の 8 文字
    expect(clientId).toMatch(/^[a-z0-9]{8}$/u);
    expect(useSettingsStore.getState().clientId).toBe(clientId);
  });

  it('端末に書く形は clientId を持たず、書いた形を読み戻すと同じ値になる', () => {
    const { partialize, merge } = useSettingsStore.persist.getOptions();
    const current = useSettingsStore.getState();
    const stored: object = partialize?.(current) ?? {};
    expect(Object.keys(stored)).not.toContain('clientId');
    expect(Object.keys(stored)).not.toContain('setTheme');
    const restored = merge?.(JSON.parse(JSON.stringify(stored)), current) ?? current;
    expect(restored.safeguards).toEqual(current.safeguards);
    expect(restored.chatImageWidth).toBe(current.chatImageWidth);
  });

  it('壊れた保存値（物でない）は既定で起動する', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const restored = merge?.('broken', current) ?? current;
    expect(restored.loreDictionariesOn).toBe(true);
    expect(restored.llmProfileId).toBeNull();
  });

  it('範囲を持つ項目の setter は、読み戻しと同じく範囲に収める', () => {
    useSettingsStore.getState().setChatLogWindow(Number.NaN);
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const fallback = (merge?.({}, current) ?? current).chatLogWindow;
    expect(useSettingsStore.getState().chatLogWindow).toBe(fallback);
  });

  it('配色は保存値を読み戻し、無い・知らない値なら OS に従う', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const theme = (saved: object) => (merge?.(saved, current) ?? current).theme;

    expect(theme({ theme: 'dark' })).toBe('dark');
    expect(theme({})).toBe('system');
    expect(theme({ theme: 'sepia' })).toBe('system');
  });

  it('操作系・繋がっていないノードを出すかは、無い・真偽でない値なら出さない', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const restored = (saved: object): { control: boolean; unlinked: boolean } => {
      const state = merge?.(saved, current) ?? current;
      return { control: state.showControlNodes, unlinked: state.showUnlinkedNodes };
    };

    expect(restored({ showControlNodes: true })).toEqual({ control: true, unlinked: false });
    expect(restored({ showUnlinkedNodes: 'yes' })).toEqual({ control: false, unlinked: false });
  });

  it('会話のアバターの出すか・置き場・枠の縦横を読み戻し、壊れた値は既定に落とす', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const read = (saved: object) => merge?.(saved, current) ?? current;
    const pick = (state: typeof current) => [
      state.chatShowAvatar,
      state.chatImagePlace,
      state.chatImageWidth,
      state.chatImageHeight,
    ];
    expect(
      pick(
        read({
          chatShowAvatar: false,
          chatImagePlace: 'top',
          chatImageWidth: 200,
          chatImageHeight: 9999,
        }),
      ),
    ).toEqual([false, 'top', 200, 1600]);
    expect(
      pick(
        read({
          chatShowAvatar: 'no',
          chatImagePlace: 'x',
          chatImageWidth: 'a',
          chatImageHeight: 1,
        }),
      ),
    ).toEqual([true, 'right', 320, 48]);
  });
  it('プレイブックの設定を読み戻し、壊れた値は既定（出す・外さない）に落とす', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const read = (saved: object) => merge?.(saved, current) ?? current;
    const kept = read({ playbooksOn: false, playbooksHidden: ['own:a', 'own:a', 3] });
    expect([kept.playbooksOn, kept.playbooksHidden]).toEqual([false, ['own:a']]);
    const broken = read({ playbooksOn: 'no', playbooksHidden: 'x' });
    expect([broken.playbooksOn, broken.playbooksHidden]).toEqual([true, []]);
  });

  it('会話のアバターの中央点を読み戻し、範囲の外は収め、読めなければ真ん中にする', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const read = (saved: object) => merge?.(saved, current) ?? current;
    const kept = read({ chatImageFocusX: 12.34, chatImageFocusY: 140 });
    expect([kept.chatImageFocusX, kept.chatImageFocusY]).toEqual([12.3, 100]);
    const broken = read({ chatImageFocusX: 'a' });
    expect([broken.chatImageFocusX, broken.chatImageFocusY]).toEqual([50, 50]);
  });

  it('会話の左の列の幅・縮めたか・控えを書くかを読み戻し、壊れた値は既定に落とす', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const read = (saved: object) => merge?.(saved, current) ?? current;

    const kept = read({ chatSidebarWidth: 320, chatSidebarCollapsed: true, chatComfyBackup: true });
    expect([kept.chatSidebarWidth, kept.chatSidebarCollapsed, kept.chatComfyBackup]).toEqual([
      320,
      true,
      true,
    ]);
    const broken = read({
      chatSidebarWidth: 9999,
      chatSidebarCollapsed: 'yes',
      chatComfyBackup: 1,
    });
    expect([broken.chatSidebarWidth, broken.chatSidebarCollapsed, broken.chatComfyBackup]).toEqual([
      480,
      false,
      false,
    ]);
  });

  it('右の列の置き場所は、知らない値なら右に落とす', () => {
    const merge = useSettingsStore.persist.getOptions().merge;
    const current = useSettingsStore.getState();
    const dock = (saved: object): string => (merge?.(saved, current) ?? current).sidePanelDock;

    expect(dock({ sidePanelDock: 'bottom' })).toBe('bottom');
    expect(dock({ sidePanelDock: 'left' })).toBe('right');
    expect(dock({})).toBe('right');
  });

  it('モデル選択の並び替えは片方ずつ変えても、もう片方を残す', () => {
    useSettingsStore.getState().setModelSort({ key: 'size' });
    useSettingsStore.getState().setModelSort({ ascending: false });

    expect(useSettingsStore.getState().modelSort).toEqual({ key: 'size', ascending: false });
    useSettingsStore.getState().setModelSort({ key: 'name', ascending: true });
  });
});

describe('接続ストア', () => {
  it('接続の成否で状態と診断が入れ替わる', () => {
    const store = useConnectionStore.getState();

    store.beginConnect();
    expect(useConnectionStore.getState().status).toBe('connecting');

    store.fail({ code: 'cors-or-down', targetUrl: 'http://127.0.0.1:8188' });
    expect(useConnectionStore.getState().status).toBe('failed');
    expect(useConnectionStore.getState().diagnosis?.code).toBe('cors-or-down');

    store.succeed();
    expect(useConnectionStore.getState().status).toBe('connected');
    expect(useConnectionStore.getState().diagnosis).toBeNull();
  });

  it('WebSocket の状態を別に持つ', () => {
    useConnectionStore.getState().setSocketStatus('reconnecting');
    expect(useConnectionStore.getState().socketStatus).toBe('reconnecting');
  });
});
