import { create } from 'zustand';

import { resolveNodePacks, type MissingNodeType, type NodePackCandidate } from '@/graph/node-packs';
import { t } from '@/i18n';
import { setOwn } from '@/lib/own-key';
import type { ManagerQueueStatus } from '@/port/manager';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';

const HTTP_FORBIDDEN = 403;
const SUCCESS_RESULT = 'success';

type LookupStatus = 'idle' | 'loading' | 'ready' | 'no-manager' | 'error';

export type PackInstall =
  | { readonly status: 'installing' }
  | { readonly status: 'installed' }
  | { readonly status: 'failed'; readonly message: string };

type RebootStatus = 'idle' | 'rebooting' | 'requested' | 'failed';

interface NodePacksState {
  readonly lookup: LookupStatus;
  readonly version: string | null;
  readonly packs: readonly NodePackCandidate[];
  readonly unresolved: readonly string[];
  readonly lookupError: string | null;
  readonly installs: Readonly<Record<string, PackInstall>>;
  readonly reboot: RebootStatus;
  readonly rebootError: string | null;
  readonly find: (baseUrl: string, missing: readonly MissingNodeType[]) => Promise<void>;
  readonly install: (baseUrl: string, pack: NodePackCandidate) => Promise<void>;
  readonly restart: (baseUrl: string) => Promise<void>;
  readonly applyQueueStatus: (status: ManagerQueueStatus) => void;
  readonly clear: () => void;
}

const INITIAL = {
  lookup: 'idle',
  version: null,
  packs: [],
  unresolved: [],
  lookupError: null,
  installs: {},
  reboot: 'idle',
  rebootError: null,
} as const satisfies Partial<NodePacksState>;

export const useNodePacksStore = create<NodePacksState>()((set, get) => {
  const putInstall = (key: string, next: PackInstall): void => {
    const installs = { ...get().installs };
    setOwn(installs, key, next);
    set({ installs });
  };

  return {
    ...INITIAL,

    async find(baseUrl, missing) {
      if (baseUrl.length === 0 || get().lookup === 'loading') return;
      set({ lookup: 'loading', lookupError: null });
      try {
        const version = await comfyPort().manager.fetchVersion(baseUrl, {});
        if (version === null) {
          set({ lookup: 'no-manager', version: null, packs: [], unresolved: [] });
          return;
        }
        const mappings = await comfyPort().manager.fetchMappings(baseUrl, {});
        const { packs, unresolved } = resolveNodePacks(missing, mappings);
        set({ lookup: 'ready', version, packs, unresolved });
      } catch (error) {
        set({ lookup: 'error', lookupError: formatComfyFailure(error) });
      }
    },

    async install(baseUrl, pack) {
      if (baseUrl.length === 0) return;
      const current = Object.hasOwn(get().installs, pack.key) ? get().installs[pack.key] : null;
      if (current?.status === 'installing' || current?.status === 'installed') return;
      putInstall(pack.key, { status: 'installing' });
      try {
        await comfyPort().manager.install(baseUrl, { key: pack.key, registry: pack.registry }, {});
      } catch (error) {
        putInstall(pack.key, { status: 'failed', message: installFailureText(error) });
      }
    },

    async restart(baseUrl) {
      if (baseUrl.length === 0 || get().reboot === 'rebooting') return;
      set({ reboot: 'rebooting', rebootError: null });
      try {
        await comfyPort().manager.reboot(baseUrl, {});
        set({ reboot: 'requested' });
      } catch (error) {
        set({ reboot: 'failed', rebootError: installFailureText(error) });
      }
    },

    applyQueueStatus(status) {
      if (status.status !== 'done') return;
      const installs = { ...get().installs };
      let changed = false;
      for (const [key, result] of Object.entries(status.results)) {
        if (!Object.hasOwn(installs, key)) continue;
        changed = true;
        setOwn<PackInstall>(
          installs,
          key,
          result === SUCCESS_RESULT
            ? { status: 'installed' }
            : { status: 'failed', message: result },
        );
      }
      if (changed) set({ installs });
    },

    clear: () => set(INITIAL),
  };
});

function installFailureText(error: unknown): string {
  const failure = comfyPort().connection.failureOf(error);
  if (failure?.status === HTTP_FORBIDDEN) return t('run.report.manager.forbidden');
  return formatComfyFailure(error);
}
