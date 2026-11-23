import { FileUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { t } from '@/i18n';

export interface WorkflowFileInputProps {
  readonly openFile: WorkflowIo['openFile'];
  readonly fileInput: React.RefObject<HTMLInputElement | null>;
}

function carriesFiles(event: DragEvent): boolean {
  return !event.defaultPrevented && (event.dataTransfer?.types.includes('Files') ?? false);
}

const DRAG_IDLE_MS = 150;

export function WorkflowFileInput({
  openFile,
  fileInput,
}: WorkflowFileInputProps): React.ReactElement {
  const [carrying, setCarrying] = useState(false);

  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
      clearTimeout(idle);
      setCarrying(false);
    };
    const onDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setCarrying(true);
      clearTimeout(idle);
      idle = setTimeout(stop, DRAG_IDLE_MS);
    };
    const onDrop = (event: DragEvent): void => {
      stop();
      if (!carriesFiles(event)) return;
      event.preventDefault();
      void openFile(event.dataTransfer?.files[0]);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      clearTimeout(idle);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [openFile]);

  return (
    <>
      {carrying ? <DropHint /> : null}
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json,image/png,.png"
        className="hidden"
        onChange={(event) => {
          void openFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </>
  );
}

function DropHint(): React.ReactElement {
  return (
    <div
      className="bg-background/70 pointer-events-none fixed inset-0 z-50 p-4 backdrop-blur-[1px]"
      role="status"
    >
      <div
        className="border-primary/60 text-foreground flex h-full flex-col items-center justify-center
          gap-3 rounded-xl border-4 border-dashed"
      >
        <FileUp className="text-primary size-16" aria-hidden />
        <p className="text-lg font-medium">{t('comfy.fileInput.dropHint')}</p>
      </div>
    </div>
  );
}
