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

const FOLLOW_SLACK = 48;

export interface CallImagesProps {
  readonly view: RunView;
  readonly onShow: (shown: ShownRun) => void;
  readonly onOpen: (run: number, file: OutputFileRef) => void;
}

export function CallImages({ view, onShow, onOpen }: CallImagesProps): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const next = imagesOf(view.runs[view.index]);
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
      {index === view.index
        ? null
        : next.map((file) => (
            <ImagePreload key={`${file.subfolder}/${file.filename}`} file={file} />
          ))}
      {view.count < 2 ? null : <StepSwitch index={index} count={view.count} onStep={onStep} />}
    </div>
  );
}

function ImagePreload({ file }: { readonly file: OutputFileRef }): null {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  useOutputSrc(baseUrl, file);
  return null;
}

function ResultImage({
  file,
  onOpen,
}: {
  readonly file: OutputFileRef;
  readonly onOpen: () => void;
}): React.ReactElement {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const src = useOutputSrc(baseUrl, file);
  const [arrived] = useState(src === null);
  const connected = useConnectionStore((state) => state.status === 'connected');
  if (outputViewUrl(baseUrl, file) === null || (src === null && !connected)) {
    return (
      <p className="text-muted-foreground text-xs">
        {t('llm.tool.imageOffline', { name: file.filename })}
      </p>
    );
  }
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

function followImage(image: HTMLImageElement): void {
  const log = image.closest('[role="log"]');
  if (log === null) return;
  const height = image.offsetHeight;
  if (bottomGapOf(log) - height <= FOLLOW_SLACK) {
    log.scrollBy({ top: height });
  }
}
