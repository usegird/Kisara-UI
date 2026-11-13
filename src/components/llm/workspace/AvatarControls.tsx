import { ImagePlus } from 'lucide-react';

import { chatImageId } from '@/chat/chat-sources';
import { AvatarPickerDialog } from '@/components/llm/dialogs/AvatarPickerDialog';
import { DialogTrigger } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { linkNewPreset } from '@/store/chat/preset-import';
import { useChatStore } from '@/store/use-chat-store';
import { usePresetsStore } from '@/store/use-presets-store';

// ─────────────────────────────
// 会話の画面のアバターの操作。画像を選ぶアイコン（移動は置く側が渡す）。
// ─────────────────────────────

const ICON = `text-muted-foreground hover:text-foreground hover:bg-background/80 inline-flex size-6
  items-center justify-center rounded-sm disabled:pointer-events-none disabled:opacity-40`;

/** 会話が写したプリセットの id（一覧に無ければ null） */
function usePresetId(chatId: string): string | null {
  const linked = useChatStore((state) => state.chats[chatId]?.preset?.id ?? null);
  const found = usePresetsStore((state) => linked !== null && state.presets[linked] !== undefined);
  return found ? linked : null;
}

/**
 * アイコン。右から移動（`move`）・画像を選ぶの順に並べる。枠を掴んで運ぶ部品の中に置くので、
 * 押しても運び始めないよう押した知らせを止める
 */
export function AvatarTools({
  chatId,
  move,
}: {
  readonly chatId: string;
  readonly move: React.ReactNode;
}): React.ReactElement {
  const presetId = usePresetId(chatId);
  const imageId = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? null : chatImageId(chat);
  });
  // 会話とリンクしたプリセットの両方に書く
  const setImage = (next: string | null): void => {
    useChatStore.getState().update(chatId, { imageId: next });
    if (presetId !== null) usePresetsStore.getState().setImage(presetId, next);
  };
  const stop = (event: React.SyntheticEvent): void => event.stopPropagation();
  return (
    <div className="flex items-center gap-0.5">
      <AvatarPickerDialog
        trigger={
          <DialogTrigger
            className={ICON}
            aria-label={t('llm.image.choose')}
            title={t('llm.image.choose')}
            onMouseDown={stop}
            onTouchStart={stop}
            onKeyDown={stop}
          >
            <ImagePlus className="size-3.5" aria-hidden />
          </DialogTrigger>
        }
        value={imageId ?? ''}
        onPlace={(avatarId) => {
          if (presetId === null && avatarId !== null) linkNewPreset(chatId, avatarId);
          else setImage(avatarId);
        }}
      />
      {move}
    </div>
  );
}
