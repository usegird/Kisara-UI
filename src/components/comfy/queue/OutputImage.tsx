import { useState } from 'react';

import { useOutputSrc } from '@/hooks/run/use-output-src';
import { useNearView } from '@/hooks/ui/use-near-view';
import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// 結果画像の表示。画面に近づいてから取りに行き、読めなかったときは代替に差し替える。
// ─────────────────────────────

/** 結果画像の受け取り物 */
export interface OutputImageProps {
  readonly file: OutputFileRef;
  readonly baseUrl: string;
  readonly className?: string | undefined;
  /** 読めなかったときに出すもの。無ければ何も出さない */
  readonly fallback?: React.ReactNode;
  /** 画像の古さ（実行の開始時刻。epoch ミリ秒）。手元に持つ上限を超えたら古いものから手放す */
  readonly order?: number | undefined;
  /**
   * その画像を出した実行が終わった時刻（接続先の時計。epoch ミリ秒）。これより後に書かれたファイルは
   * 同じ名前の別の画像なので代替を出す
   */
  readonly until?: number | undefined;
}

/** 結果画像を 1 枚出す。一度読んだ画像はメモリに持ち、読み込み直すまで出せる */
export function OutputImage({
  file,
  baseUrl,
  className,
  fallback = null,
  order,
  until,
}: OutputImageProps): React.ReactElement | null {
  const { attachTarget, near } = useNearView();
  const src = useOutputSrc(baseUrl, file, { order, until, enabled: near });
  const [gone, setGone] = useState(false);

  // 画面に近づくまでは、近づいたことを知るための目印だけを置く
  if (!near) return <span ref={attachTarget} className="block size-px" aria-hidden />;
  // 接続先が無いと答えた画像は、取りに行かずに代替を出す
  if (gone || src === false) return <>{fallback}</>;
  // 手元へ写している最中は出さない（二重に取らない）
  if (src === null) return null;

  return (
    <img
      className={className}
      src={src}
      alt={file.filename}
      loading="lazy"
      onError={() => setGone(true)}
    />
  );
}
