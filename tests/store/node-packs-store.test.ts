import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComfyRequestError } from '@/comfy/request-error';
import { t } from '@/i18n';
import type { ManagerPort } from '@/port/manager';
import { comfyPort, installComfyPort } from '@/store/ports/comfy-port';
import { useNodePacksStore } from '@/store/use-node-packs-store';

const BASE = 'http://127.0.0.1:8188';
const PACK = { key: 'kj', title: 'KJ', registry: true, nodes: ['GetNode'] };

let port: ReturnType<typeof comfyPort>;

function useManager(overrides: Partial<ManagerPort>): void {
  installComfyPort({
    ...port,
    manager: {
      fetchVersion: () => Promise.resolve('V3.42'),
      fetchMappings: () =>
        Promise.resolve([{ key: 'kj', title: 'KJ', nodes: ['GetNode'], pattern: null }]),
      install: () => Promise.resolve(),
      reboot: () => Promise.resolve(),
      ...overrides,
    },
  });
}

beforeEach(() => {
  port = comfyPort();
});

afterEach(() => {
  installComfyPort(port);
  useNodePacksStore.getState().clear();
});

describe('パックの探し', () => {
  it('Manager が無ければその旨にする', async () => {
    useManager({ fetchVersion: () => Promise.resolve(null) });
    await useNodePacksStore.getState().find(BASE, [{ classType: 'GetNode', cnrId: null }]);
    expect(useNodePacksStore.getState().lookup).toBe('no-manager');
  });

  it('対応表からパックを引く', async () => {
    useManager({});
    await useNodePacksStore.getState().find(BASE, [{ classType: 'GetNode', cnrId: null }]);
    const state = useNodePacksStore.getState();
    expect([state.lookup, state.version, state.packs.map((pack) => pack.key)]).toEqual([
      'ready',
      'V3.42',
      ['kj'],
    ]);
  });
});

describe('パックの導入', () => {
  it('断られた（403）ら設定の案内を出す', async () => {
    useManager({
      install: () => Promise.reject(new ComfyRequestError('http', BASE, { status: 403 })),
    });
    await useNodePacksStore.getState().install(BASE, PACK);
    expect(useNodePacksStore.getState().installs.kj).toEqual({
      status: 'failed',
      message: t('run.report.manager.forbidden'),
    });
  });

  it('導入中は重ねて送らず、終わりの通知で成否を決める', async () => {
    const install = vi.fn(() => Promise.resolve());
    useManager({ install });
    await useNodePacksStore.getState().install(BASE, PACK);
    await useNodePacksStore.getState().install(BASE, PACK);
    expect(install).toHaveBeenCalledTimes(1);

    useNodePacksStore
      .getState()
      .applyQueueStatus({ status: 'done', target: null, results: { kj: 'success', other: 'x' } });
    const { installs } = useNodePacksStore.getState();
    expect(installs.kj?.status).toBe('installed');
    expect(Object.hasOwn(installs, 'other')).toBe(false);
  });
});
