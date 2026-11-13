import { useEffect, useState } from 'react';

import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// モデル1つぶんのメモを、選ばれたときだけ読み、保存を押したときだけ書く。
// どこから読むかはストアが決める。
// ─────────────────────────────

/** メモの読み込みの段階 */
type ModelNotesStatus = 'idle' | 'loading' | 'ready' | 'error';

/** メモの読み込みの段階と中身 */
interface ModelNotesState {
  readonly status: ModelNotesStatus;
  /** ファイルの中身。無ければ null */
  readonly text: string | null;
  readonly error: string | null;
}

/** 書けたら null、書けなければ理由 */
type SaveModelNotes = (text: string) => Promise<string | null>;

/** メモの読み込みの状態と、保存の手続き */
export interface ModelNotes extends ModelNotesState {
  readonly save: SaveModelNotes;
}

const IDLE: ModelNotesState = { status: 'idle', text: null, error: null };
const LOADING: ModelNotesState = { status: 'loading', text: null, error: null };

interface Result {
  readonly key: string;
  readonly state: ModelNotesState;
}

/**
 * モデル 1 つぶんのメモを読み、保存の手続きと合わせて返す。結果はどのモデルのものかを添えて持ち
 * （use-model-metadata と同じ）、別のモデルに切り替わった瞬間は描画中に「読み込み中」へ落ちる。
 * @param filename - 選択肢の文字列をそのまま渡す。null なら読まない
 */
export function useModelNotes(folder: string, filename: string | null): ModelNotes {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const route = useModelNotesStore((state) => (state.baseUrl === baseUrl ? state.status : 'idle'));
  const ensureRoute = useModelNotesStore((state) => state.ensure);
  const routeError = useModelNotesStore((state) => state.error);
  const readNotes = useModelNotesStore((state) => state.read);
  const saveNotes = useModelNotesStore((state) => state.save);
  const [result, setResult] = useState<Result | null>(null);

  const wanted = filename !== null && baseUrl.length > 0;
  const active = wanted && route === 'ready';
  const key = active ? [baseUrl, folder, filename].join(' ') : '';

  useEffect(() => {
    if (wanted) void ensureRoute(baseUrl);
  }, [wanted, baseUrl, ensureRoute]);

  useEffect(() => {
    if (!active || filename === null) return;

    let alive = true;
    readNotes(baseUrl, folder, filename)
      .then((text) => {
        if (alive) setResult({ key, state: { status: 'ready', text, error: null } });
      })
      .catch((cause: unknown) => {
        if (alive) {
          setResult({
            key,
            state: { status: 'error', text: null, error: formatComfyFailure(cause) },
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [active, key, baseUrl, folder, filename, readNotes]);

  const save: SaveModelNotes = async (text) => {
    if (!active || filename === null) return null;
    try {
      await saveNotes(baseUrl, folder, filename, text);
    } catch (cause) {
      return formatComfyFailure(cause);
    }
    setResult({ key, state: { status: 'ready', text, error: null } });
    return null;
  };

  if (!wanted) return { ...IDLE, save };
  if (route === 'error') return { status: 'error', text: null, error: routeError, save };
  return { ...(result?.key === key && active ? result.state : LOADING), save };
}
