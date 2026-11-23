import { formatComfyFailure } from '@/queue/comfy-failure-text';

type CommonStatus = 'idle' | 'loading' | 'error';

export interface BaseUrlResource {
  readonly status: string;
  readonly baseUrl: string;
  readonly error: string | null;
}

interface ResourcePatch {
  readonly status?: CommonStatus;
  readonly baseUrl?: string;
  readonly error?: string | null;
}

export interface BaseUrlActions {
  readonly ensure: (baseUrl: string) => Promise<void>;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly invalidate: () => void;
}

type ResourceSetter<R> = (
  patch: Partial<R> | ResourcePatch | ((state: R) => R | ResourcePatch),
) => void;

export function createBaseUrlActions<R extends BaseUrlResource>(
  set: ResourceSetter<R>,
  get: () => R,
  fetchFor: (baseUrl: string) => Promise<Partial<R>>,
): BaseUrlActions {
  async function load(baseUrl: string): Promise<void> {
    if (baseUrl.length === 0) return;
    set({ status: 'loading', baseUrl, error: null });

    try {
      const patch = await fetchFor(baseUrl);
      if (get().baseUrl !== baseUrl) return;
      set(patch);
    } catch (error) {
      if (get().baseUrl !== baseUrl) return;
      set({ status: 'error', error: formatComfyFailure(error) });
    }
  }

  return {
    ensure: async (baseUrl) => {
      const state = get();
      if (state.baseUrl === baseUrl && state.status !== 'idle') return;
      await load(baseUrl);
    },
    refresh: load,
    invalidate: () => set((state) => (state.status === 'loading' ? state : { status: 'idle' })),
  };
}
