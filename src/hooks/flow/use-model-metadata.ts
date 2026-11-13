import { useEffect, useState } from 'react';

import { summarizeModelMetadata, type ModelInfo } from '@/graph/model-metadata';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// モデル1つぶんの埋め込み情報を、開かれたときだけ取りに行く。
// ─────────────────────────────

/** 埋め込み情報の取り寄せの段階 */
type ModelMetadataStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 埋め込み情報の取り寄せの段階と結果 */
export interface ModelMetadataState {
  readonly status: ModelMetadataStatus;
  readonly info: ModelInfo | null;
  readonly error: string | null;
}

const IDLE: ModelMetadataState = { status: 'idle', info: null, error: null };
const LOADING: ModelMetadataState = { status: 'loading', info: null, error: null };

interface Result {
  readonly key: string;
  readonly state: ModelMetadataState;
}

/**
 * モデル 1 つぶんの埋め込み情報を取り寄せて返す。一覧のように持ち回さない（数十 KB になることがあり、
 * 全件ぶんを抱えると無駄が大きい）。無いのが普通なので、空で返ってくることを失敗として扱わない。
 *
 * 結果はどのモデルのものかを添えて持つ。別のモデルに切り替わった瞬間は描画中に「読み込み中」へ
 * 落ちるので、副作用の中で状態を書き戻さずに済む。
 * @param filename - 接続先が解決する名前（選択肢の文字列をそのまま渡す）
 */
export function useModelMetadata(folder: string, filename: string | null): ModelMetadataState {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const [result, setResult] = useState<Result | null>(null);

  const active = filename !== null && baseUrl.length > 0;
  const key = active ? [baseUrl, folder, filename].join(' ') : '';

  useEffect(() => {
    if (!active || filename === null) return;

    let alive = true;
    comfyPort()
      .models.fetchMetadata(baseUrl, folder, filename, {})
      .then((metadata) => {
        if (!alive) return;
        setResult({
          key,
          state: { status: 'ready', info: summarizeModelMetadata(metadata), error: null },
        });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        const message = formatComfyFailure(cause);
        setResult({ key, state: { status: 'error', info: null, error: message } });
      });

    return () => {
      alive = false;
    };
  }, [active, key, baseUrl, folder, filename]);

  if (!active) return IDLE;

  return result?.key === key ? result.state : LOADING;
}
