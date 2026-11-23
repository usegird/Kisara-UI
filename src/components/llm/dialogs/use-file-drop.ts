import { useState } from 'react';

import { carriesFiles } from '@/components/shared/file-drop';
import { readDroppedFiles, type PathedFile } from '@/lib/dropped-files';

export function useFileDrop(
  enabled: boolean,
  onFiles: (files: PathedFile[]) => void,
): {
  readonly dropping: boolean;
  readonly dropHandlers: Pick<
    React.HTMLAttributes<HTMLDivElement>,
    'onDragOver' | 'onDragLeave' | 'onDrop'
  >;
} {
  const [dropping, setDropping] = useState(false);
  return {
    dropping,
    dropHandlers: {
      onDragOver: (event) => {
        if (!carriesFiles(event) || !enabled) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDropping(true);
      },
      onDragLeave: (event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        setDropping(false);
      },
      onDrop: (event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDropping(false);
        void readDroppedFiles(event.dataTransfer).then(onFiles);
      },
    },
  };
}
