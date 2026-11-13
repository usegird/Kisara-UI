import { useEffect } from 'react';

import { LORA_FOLDER } from '@/graph/model-files';
import { t, type MessageKey } from '@/i18n';
import { useConnectionStore } from '@/store/use-connection-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// 差し込みのアイコンが使う一覧を接続したときに 1 回だけ取り、それぞれ使えるかを返す。
// スタイルの表は編集の画面と同じ置き場を使う（取り口を増やさない）。
// ─────────────────────────────

/** 一覧が使えるか。サーバーの事情で使えないときは理由を持ち、取りに行っている最中は待ち */
export type SourceState =
  | { readonly kind: 'ready' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'unavailable'; readonly reason: string };

/** 差し込みのアイコンごとの、一覧が使えるか */
interface InsertSources {
  readonly lora: SourceState;
  readonly styles: SourceState;
  readonly wildcards: SourceState;
  readonly tags: SourceState;
}

const READY: SourceState = { kind: 'ready' };
const WAITING: SourceState = { kind: 'waiting' };

function unavailable(reason: string): SourceState {
  return { kind: 'unavailable', reason };
}

/** つながったら Lora・スタイル・ワイルドカードの一覧を取り、それぞれ使えるかを返す */
export function useInsertSources(): InsertSources {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');

  const loraStatus = useModelFilesStore((state) => state.folders.get(LORA_FOLDER)?.status);
  const ensureModels = useModelFilesStore((state) => state.ensure);
  const stylesStatus = useStylesStore((state) => state.status);
  const loadStyles = useStylesStore((state) => state.load);
  const wildcardsStatus = useWildcardsStore((state) =>
    state.baseUrl === baseUrl ? state.status : 'idle',
  );
  const ensureWildcards = useWildcardsStore((state) => state.ensure);
  const tagsStatus = useTagsStore((state) => state.status);
  const loadTags = useTagsStore((state) => state.load);

  useEffect(() => {
    if (!connected) return;
    if (stylesStatus === 'idle') void loadStyles(baseUrl);
    // 補完の辞書もここで読む（欄を打ち始める前に読み終えておく）
    if (tagsStatus === 'idle') void loadTags(baseUrl);
    void ensureWildcards(baseUrl);
    // Lora のパラメータが画面に無くても、差し込みのアイコンのために取る
    void ensureModels(baseUrl, LORA_FOLDER);
  }, [
    connected,
    baseUrl,
    stylesStatus,
    loadStyles,
    tagsStatus,
    loadTags,
    ensureWildcards,
    ensureModels,
  ]);

  if (!connected) {
    const offline = unavailable(t('insertBar.sources.offline'));
    return { lora: offline, styles: offline, wildcards: offline, tags: offline };
  }

  return {
    lora:
      loraStatus === 'ready'
        ? READY
        : loraStatus === 'error'
          ? unavailable(t('insertBar.sources.loraUnavailable'))
          : WAITING,
    // 保存中も読めている扱い（書き戻しの間に押せなくならないように）
    styles:
      stylesStatus === 'ready' || stylesStatus === 'saving'
        ? READY
        : stylesStatus === 'error'
          ? unavailable(t('insertBar.sources.stylesUnavailable'))
          : WAITING,
    wildcards:
      wildcardsStatus === 'ready'
        ? READY
        : wildcardsStatus === 'unavailable'
          ? unavailable(t('insertBar.sources.wildcardsNoRoute'))
          : wildcardsStatus === 'error'
            ? unavailable(t('insertBar.sources.wildcardsFailed'))
            : WAITING,
    tags: listSource(tagsStatus, 'insertBar.sources.tagsUnavailable'),
  };
}

/** 読んで書く一覧（スタイル・タグ辞書）が使えるか。保存中も読めている扱い（書き戻しの間に押せなくならない） */
function listSource(
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error',
  failed: MessageKey,
): SourceState {
  if (status === 'ready' || status === 'saving') return READY;
  return status === 'error' ? unavailable(t(failed)) : WAITING;
}
