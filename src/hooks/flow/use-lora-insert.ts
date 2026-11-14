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

// ─────────────────────────────
// 差し込みのアイコンから Lora を選んで入れる手続き。Lora を選ぶダイアログには値と手続きだけを渡す
// （ダイアログはこの中身を知らない。部品の間を疎にする）。
// ─────────────────────────────

/** 差し込み先にする欄。複数行の欄だけで、ダイアログの中は除く */
function acceptTarget(field: TextField): boolean {
  return field instanceof HTMLTextAreaElement && field.closest('[role="dialog"]') === null;
}

/** 差し込み先が無いときの案内 */
function noTarget(): string {
  return t('insertBar.noTarget');
}

/** Lora を選ぶダイアログへ渡す開閉・一覧・差し込みの手続き */
interface LoraInsert {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  /** ダイアログへそのまま渡すもの */
  readonly options: readonly string[];
  readonly index: ReadonlyMap<string, ModelFile>;
  readonly baseUrl: string;
  readonly loading: boolean;
  readonly onRefresh: () => void;
  readonly placeBlocked: string | null;
  readonly drag: LoraDragText;
  /** 選んだ Lora を入れる。`origin` は押したカード（入れた位置まで札を飛ばす） */
  readonly onPlace: (value: string, origin?: DOMRect | null) => Promise<string | null>;
  /** 差し込み先の欄（挿入位置のアイコンを重ねる）。無ければ null */
  readonly target: HTMLTextAreaElement | null;
  /** 情報の語・メモをそのまま入れる */
  readonly onInsertText: (text: string) => void;
  readonly finalFocus: React.RefObject<HTMLElement | null>;
}

const EMPTY_INDEX: ReadonlyMap<string, ModelFile> = new Map();

/**
 * 差し込み先の欄を追い、選んだ Lora の文字をそこへ入れる手続きを作る。
 * 焦点を閉じ込めないので、閉じるのを待たずに入れる。
 */
export function useLoraInsert(): LoraInsert {
  // 開いているかはタブごとに持つ
  const [open, setOpen] = useTabState('loraInsert.open', false);
  const target = useTextFieldWhile(acceptTarget, open);
  // 閉じたあとに焦点を戻す先（基盤は ref の形で受け取る）。差し込み先が変わったら作り直す。
  // 外の部品（Base UI）へ ref として渡すので、compiler に任せず手で固定する
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
