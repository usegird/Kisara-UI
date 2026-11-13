import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { bottomGapOf } from '@/components/llm/message/log-scroll';
import { StepSwitch } from '@/components/llm/message/StepSwitch';
import { imagesOf, type RunView, type ShownRun } from '@/components/llm/message/tool-call-runs';
import { useOutputSrc } from '@/hooks/run/use-output-src';
import { t } from '@/i18n';
import type { OutputFileRef } from '@/port/files';
import { useConnectionStore } from '@/store/use-connection-store';
import { outputSrc, outputViewUrl, useOutputImagesStore } from '@/store/use-output-images-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// ワークフローの呼び出しの結果の画像。1 件の呼び出しの画像と実行の切り替え、画像の読み込みと
// ビューワーを開く入口。
// ─────────────────────────────

/** 末尾を見ていたとみなす、読み終えた画像の下の余り（px） */
const FOLLOW_SLACK = 48;

/** 1 件の呼び出しの画像と切り替えの props */
export interface CallImagesProps {
  readonly view: RunView;
  readonly onShow: (shown: ShownRun) => void;
  /** 画像を押した（実行の番号と画像） */
  readonly onOpen: (run: number, file: OutputFileRef) => void;
}

/** 1 件の呼び出しの画像と切り替え。切り替える途中は、新しい画像を読み終えるまで前の画像を出す */
export function CallImages({ view, onShow, onOpen }: CallImagesProps): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const next = imagesOf(view.runs[view.index]);
  // 新しい実行の画像をすべて手元に写せたか（写せない・接続先が無いものは待たない）
  const loaded = useOutputImagesStore((state) =>
    next.every((file) => {
      const url = outputViewUrl(baseUrl, file);
      return url === null || outputSrc(state.images, url) !== null;
    }),
  );
  const index = view.held !== null && !loaded ? view.held : view.index;
  const images = imagesOf(view.runs[index]);
  const onStep = (delta: number): void => onShow({ index: index + delta, count: view.count });
  return (
    <div className="flex flex-col items-center gap-2">
      {images.map((file) => {
        const onImageOpen = (): void => onOpen(index, file);
        return (
          <ResultImage
            key={`${file.subfolder}/${file.filename}`}
            file={file}
            onOpen={onImageOpen}
          />
        );
      })}
      {/* 切り替える前に、新しい画像を手元へ写しておく（出さない） */}
      {index === view.index
        ? null
        : next.map((file) => (
            <ImagePreload key={`${file.subfolder}/${file.filename}`} file={file} />
          ))}
      {view.count < 2 ? null : <StepSwitch index={index} count={view.count} onStep={onStep} />}
    </div>
  );
}

/** 画像を手元へ写すだけ（描かない） */
function ImagePreload({ file }: { readonly file: OutputFileRef }): null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  useOutputSrc(baseUrl, file);
  return null;
}

/**
 * 結果の画像だけを中央に置く。幅は会話の欄まで、高さはログの高さの半分まで（ログが大きさの基準）。
 * 読み込んでいる間は処理中のアイコンを回す。押すと画像のビューワーを会話の画面に重ねて開く。
 * ComfyUI の接続先が無ければ画像を取れないので、名前だけを出して押せなくする
 */
function ResultImage({
  file,
  onOpen,
}: {
  readonly file: OutputFileRef;
  readonly onOpen: () => void;
}): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const src = useOutputSrc(baseUrl, file);
  // 出したときに読み込み中だったか。手元に写してあった画像（切り替え・差し替え）では送らない
  const [arrived] = useState(src === null);
  const connected = useConnectionStore((state) => state.status === 'connected');
  // 接続先が無い・つないでいない（手元にも無い）ときは取りに行かず、つないだら出す
  if (outputViewUrl(baseUrl, file) === null || (src === null && !connected)) {
    return (
      <p className="text-muted-foreground text-xs">
        {t('llm.tool.imageOffline', { name: file.filename })}
      </p>
    );
  }
  // 接続先が無いと答えた画像（消えた `temp` など）は取り直さず、名前だけ出す
  if (src === false) {
    return (
      <p className="text-muted-foreground text-xs">
        {t('llm.tool.imageMissing', { name: file.filename })}
      </p>
    );
  }
  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    if (arrived) followImage(event.currentTarget);
  };
  return (
    <button
      type="button"
      className="block max-w-full cursor-zoom-in"
      aria-label={t('llm.tool.openImage', { name: file.filename })}
      onClick={onOpen}
    >
      {src === null ? (
        <Loader2
          className="text-muted-foreground size-6 motion-safe:animate-spin"
          aria-label={t('llm.tool.imageLoading')}
        />
      ) : (
        <img
          src={src}
          alt=""
          className="max-h-[50cqh] max-w-full object-contain"
          onLoad={onImageLoad}
        />
      )}
    </button>
  );
}

/**
 * 初めて読み終えた画像の高さだけログを下へ送る（末尾を見ていたときだけ）。行や出力アンカーの座標の
 * 測定ではなく、送る量に画像の高さを 1 回読むだけ（測定の仕組みの対象外）
 */
function followImage(image: HTMLImageElement): void {
  const log = image.closest('[role="log"]');
  if (log === null) return;
  const height = image.offsetHeight;
  if (bottomGapOf(log) - height <= FOLLOW_SLACK) {
    log.scrollBy({ top: height });
  }
}
