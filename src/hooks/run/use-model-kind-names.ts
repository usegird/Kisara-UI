import { CHECKPOINT_FOLDER, DIFFUSION_MODEL_FOLDER, LORA_FOLDER } from '@/graph/model-files';
import type { ModelKindNames } from '@/queue/task-detail';
import { useModelFilesStore } from '@/store/use-model-files-store';

const NONE: ReadonlySet<string> = new Set();

export function useModelKindNames(): ModelKindNames {
  const loras = useModelFilesStore((state) => state.folders.get(LORA_FOLDER)?.index);
  const checkpoints = useModelFilesStore((state) => state.folders.get(CHECKPOINT_FOLDER)?.index);
  const diffusion = useModelFilesStore((state) => state.folders.get(DIFFUSION_MODEL_FOLDER)?.index);

  return {
    loraNames: loras === undefined ? NONE : new Set(loras.keys()),
    modelNames:
      checkpoints === undefined && diffusion === undefined
        ? NONE
        : new Set([...(checkpoints?.keys() ?? []), ...(diffusion?.keys() ?? [])]),
  };
}
