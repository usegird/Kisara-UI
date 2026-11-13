import { formatComfyFailure } from '@/queue/comfy-failure-text';

// ─────────────────────────────
// 接続先ごとに 1 回だけ取る資源（ワイルドカードの一覧・モデルのメモの置き場）の取り方。
// 取っている間に接続先が替わったら、前の接続先の結果を入れない。
// ─────────────────────────────

/** どの資源にもある段階（未取得・取っている・失敗） */
type CommonStatus = 'idle' | 'loading' | 'error';

/** 接続先ごとの資源が持つ段階と接続先 */
export interface BaseUrlResource {
  /** 共通の段階のほか、資源ごとの取れた段階 */
  readonly status: string;
  /** どの接続先の結果か。変わったら取り直す */
  readonly baseUrl: string;
  readonly error: string | null;
}

/** 共通の段階を書く差分 */
interface ResourcePatch {
  readonly status?: CommonStatus;
  readonly baseUrl?: string;
  readonly error?: string | null;
}

/** 接続先ごとの資源の操作 */
export interface BaseUrlActions {
  /** その接続先の分が未取得のときだけ取る */
  readonly ensure: (baseUrl: string) => Promise<void>;
  /** 取り直す */
  readonly refresh: (baseUrl: string) => Promise<void>;
  /** 未取得に戻す（接続し直すとき）。取れた値は残し、次の `ensure` で取り直す */
  readonly invalidate: () => void;
}

/** ストアの書き方（ストアの `set`） */
type ResourceSetter<R> = (
  patch: Partial<R> | ResourcePatch | ((state: R) => R | ResourcePatch),
) => void;

/**
 * 接続先ごとの資源の操作を作る。`fetchFor` は取れた値をストアへ入れる差分を返す
 */
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
