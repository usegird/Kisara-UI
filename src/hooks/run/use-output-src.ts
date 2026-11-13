import { useEffect, useEffectEvent } from 'react';

import type { OutputFileRef } from '@/port/files';
import { useConnectionStore } from '@/store/use-connection-store';
import { outputSrc, outputViewUrl, useOutputImagesStore } from '@/store/use-output-images-store';

// ─────────────────────────────
// 結果画像の `img` に渡す先。結果画像を出すところは全部これを通す。
// ─────────────────────────────

/** 結果画像の出し方の添え物 */
export interface OutputSrcOptions {
  /** 画像の古さ（epoch ミリ秒）。上限を超えたとき古いものから手放すのに使う */
  readonly order?: number | undefined;
  /**
   * その画像を出した実行が終わった時刻（epoch ミリ秒。接続先の時計の値だけ）。
   * これより後に書かれたファイルは出さない
   */
  readonly until?: number | undefined;
  /** false にすると取りに行かない（画面に近づくまで待つ） */
  readonly enabled?: boolean | undefined;
}

/**
 * 結果画像を手元へ写し、`img` に渡す先を返す（再起動で `temp` が消えても見える）。
 * 取っている最中・まだ取らないとき・URL を作れないときは null（何も出さない）、接続先が無いと
 * 答えた画像・その実行の後に書かれた画像は false（代替を出す）。
 */
export function useOutputSrc(
  baseUrl: string,
  file: OutputFileRef,
  { order, until, enabled = true }: OutputSrcOptions = {},
): string | null | false {
  const url = outputViewUrl(baseUrl, file);
  const src = useOutputImagesStore((state) =>
    url === null ? null : outputSrc(state.images, url, until),
  );
  const ensureImage = useOutputImagesStore((state) => state.ensure);
  const connected = useConnectionStore((state) => state.status === 'connected');

  // 写すのは外の資源（ComfyUI）との同期なので effect で行う。
  // `file` は毎回作り直されるので、同じ画像かどうかは URL で見る。つないだら頼み直す
  // （頼み直しても、持っている・取っている・無いと答えた画像は取り直さない）
  const start = useEffectEvent((): void => {
    void ensureImage(baseUrl, file, { order, until });
  });
  useEffect(() => {
    if (enabled) start();
  }, [url, connected, enabled]);

  return src;
}
