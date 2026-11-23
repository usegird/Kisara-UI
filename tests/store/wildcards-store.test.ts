import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useWildcardsStore, wildcardEntriesOf } from '@/store/use-wildcards-store';

const BASE = 'http://127.0.0.1:8188';

let port: ReturnType<typeof comfyPort>;
let finish: ((values: string[]) => void) | null = null;

beforeEach(() => {
  port = comfyPort();
  installComfyPort({
    ...port,
    assets: {
      ...port.assets,
      fetchWildcards: () => Promise.resolve(['__a__']),
      fetchWildcardEntries: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  });
  useWildcardsStore.setState({ baseUrl: BASE, status: 'ready', entries: {} });
});

afterEach(() => {
  installComfyPort(port);
  finish = null;
  useWildcardsStore.setState({ baseUrl: '', status: 'idle', names: [], entries: {} });
});

describe('ワイルドカードの中身', () => {
  it('取れたら名前ごとに持つ', async () => {
    const loading = useWildcardsStore.getState().ensureEntries(BASE, '__a__');
    expect(wildcardEntriesOf(useWildcardsStore.getState().entries, '__a__')?.status).toBe(
      'loading',
    );

    finish?.(['x']);
    await loading;

    expect(wildcardEntriesOf(useWildcardsStore.getState().entries, '__a__')).toEqual({
      status: 'ready',
      values: ['x'],
    });
  });

  it('取っている間に一覧を取り直したら、前の結果を書かない', async () => {
    const loading = useWildcardsStore.getState().ensureEntries(BASE, '__a__');
    await useWildcardsStore.getState().refresh(BASE);

    finish?.(['x']);
    await loading;

    expect(wildcardEntriesOf(useWildcardsStore.getState().entries, '__a__')).toBeNull();
  });

  it('接続先の名前が __proto__ でも、物の親を読まない', () => {
    expect(wildcardEntriesOf({}, '__proto__')).toBeNull();
  });
});
