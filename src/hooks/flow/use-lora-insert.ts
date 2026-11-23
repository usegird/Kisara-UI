import { useMemo } from 'react';

import { LORA_FOLDER } from '@/graph/model-files';
import type { ModelFile } from '@/graph/model-files';
import { useLoraDragText, useLoraText, type LoraDragText } from '@/hooks/flow/use-lora-text';
import { useModelFiles } from '@/hooks/flow/use-model-files';
import { useTabState } from '@/hooks/flow/use-tab-state';
import { useTextFieldWhile } from '@/hooks/flow/use-text-field-focus';
import { t } from '@/i18n';
import type { TextField } from '@/lib/insert-at-caret';
import { placeEntry } from '@/lib/insert-motion';

function acceptTarget(field: TextField): boolean {
  return field instanceof HTMLTextAreaElement && field.closest('[role="dialog"]') === null;
}

function noTarget(): string {
  return t('insertBar.noTarget');
}

interface LoraInsert {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly options: readonly string[];
  readonly index: ReadonlyMap<string, ModelFile>;
  readonly baseUrl: string;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly placeBlocked: string | null;
  readonly drag: LoraDragText;
  readonly onPlace: (value: string, origin?: DOMRect | null) => Promise<string | null>;
  readonly target: HTMLTextAreaElement | null;
  readonly onInsertText: (text: string) => void;
  readonly finalFocus: React.RefObject<HTMLElement | null>;
}

const EMPTY_INDEX: ReadonlyMap<string, ModelFile> = new Map();

export function useLoraInsert(): LoraInsert {
  const [open, setOpen] = useTabState('loraInsert.open', false);
  const target = useTextFieldWhile(acceptTarget, open);
  const finalFocus = useMemo<React.RefObject<HTMLElement | null>>(
    () => ({ current: target }),
    [target],
  );

  const models = useModelFiles(true);
  const index = models.indexes.get(LORA_FOLDER) ?? EMPTY_INDEX;
  const options = [...index.values()].map((file) => file.name);
  const loraText = useLoraText();
  const drag = useLoraDragText(LORA_FOLDER);

  return {
    open,
    setOpen,
    options,
    index,
    baseUrl: models.baseUrl,
    loading: models.statusOf(LORA_FOLDER) === 'loading',
    onRefresh: () => models.refresh(LORA_FOLDER),
    placeBlocked: target === null ? noTarget() : null,
    drag,
    onPlace: async (value, origin = null) => {
      const result = await loraText(LORA_FOLDER, value);
      if ('error' in result) return result.error;
      if (target === null) return noTarget();
      return placeEntry(target, result.text, origin) ? null : noTarget();
    },
    onInsertText: (text) => {
      if (target !== null) placeEntry(target, text, null);
    },
    finalFocus,
    target: target instanceof HTMLTextAreaElement ? target : null,
  };
}
