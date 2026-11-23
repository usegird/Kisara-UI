import { Save, SaveAll, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { EMPTY_CHARACTER } from '@/chat/card';
import { CARD_FILE_MAX_BYTES } from '@/chat/card-read';
import { characterOf, chatImageId, chatLorebooks } from '@/chat/chat-sources';
import type { CharacterFields, Chat, Preset } from '@/chat/types';
import { ActionButton } from '@/components/llm/prompt/PromptItemCard';
import { HistoryCombobox } from '@/components/ui/history-combobox';
import { toastError } from '@/components/ui/toast-manager';
import { t } from '@/i18n';
import { wholeMegabytes } from '@/lib/file-size';
import {
  freePresetName,
  linkCardFile,
  linkPreset,
  relinkPreset,
  resetPrompt,
} from '@/store/chat/preset-import';
import { usePresetsStore } from '@/store/use-presets-store';

export interface PresetUnitRowProps {
  readonly chatId: string;
  readonly chat: Chat;
  readonly preset: Preset | null;
}

const ROW = 'flex min-w-0 items-center gap-2 pl-1';

function pickCardFile(chatId: string): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.png,.json,image/png,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file === undefined) return;
    void linkCardFile(chatId, file).then((result) => {
      if (result === 'linked') return;
      toastError(
        result === 'too-large'
          ? t('common.fileTooLarge', { name: file.name, size: wholeMegabytes(CARD_FILE_MAX_BYTES) })
          : t('llm.prompt.preset.notCard', { name: file.name }),
      );
    });
  });
  input.click();
}

function fieldsOf(chat: Chat): CharacterFields {
  return characterOf(chat) ?? EMPTY_CHARACTER;
}

export function PresetUnitRow({ chatId, chat, preset }: PresetUnitRowProps): React.ReactElement {
  return (
    <div className={ROW}>
      <div className="min-w-0 flex-1">
        <PresetNameBar
          key={`name:${preset?.id ?? ''}`}
          chatId={chatId}
          chat={chat}
          preset={preset}
        />
      </div>
    </div>
  );
}

function PresetNameBar({
  chatId,
  chat,
  preset,
}: {
  readonly chatId: string;
  readonly chat: Chat;
  readonly preset: Preset | null;
}): React.ReactElement {
  const presets = usePresetsStore((state) => state.presets);
  const [name, setName] = useState(preset?.name ?? '');
  const store = usePresetsStore.getState;
  const list = Object.values(presets).sort((a, b) => b.updatedAt - a.updatedAt);
  const trimmed = name.trim();
  const renamed = preset === null || trimmed !== preset.name;

  const choose = (picked: string): void => {
    const found = list.find((item) => item.name === picked);
    if (found !== undefined) linkPreset(chatId, found.id);
  };
  const save = (): void => {
    if (trimmed.length === 0) return;
    if (preset === null) {
      const created = store().add(
        freePresetName(trimmed),
        fieldsOf(chat),
        chatImageId(chat),
        chatLorebooks(chat),
      );
      relinkPreset(chatId, created);
      return;
    }
    store().update(preset.id, trimmed, fieldsOf(chat), {
      imageId: chatImageId(chat),
      lorebooks: chatLorebooks(chat),
    });
    relinkPreset(chatId, { ...preset, name: trimmed });
  };
  const saveAs = (): void => {
    const base =
      preset === null || (renamed && trimmed.length > 0)
        ? trimmed
        : t('llm.prompt.copyOf', { name: preset.name });
    if (base.length === 0) return;
    const created = store().add(
      freePresetName(base),
      fieldsOf(chat),
      chatImageId(chat),
      chatLorebooks(chat),
    );
    relinkPreset(chatId, created);
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <HistoryCombobox
        className="min-w-0 flex-1 text-xs"
        value={name}
        onValueChange={setName}
        onPick={choose}
        onEnter={save}
        items={list.map((item) => item.name)}
        label={t('llm.prompt.preset.nameField')}
        placeholder={t('llm.prompt.preset.choose')}
        actions={[
          {
            label: t('llm.prompt.preset.createNew'),
            onSelect: () => {
              resetPrompt(chatId);
              setName('');
            },
          },
          { label: t('llm.prompt.preset.fromFile'), onSelect: () => pickCardFile(chatId) },
        ]}
      />
      <ActionButton
        label={t('llm.prompt.preset.save')}
        visible
        disabled={trimmed.length === 0}
        onClick={save}
      >
        <Save className="size-3.5" aria-hidden />
      </ActionButton>
      <ActionButton
        label={t('llm.prompt.preset.saveAs')}
        visible
        disabled={preset === null && trimmed.length === 0}
        onClick={saveAs}
      >
        <SaveAll className="size-3.5" aria-hidden />
      </ActionButton>
      <ActionButton
        label={
          preset === null
            ? t('llm.prompt.preset.removeTitle')
            : t('llm.prompt.preset.remove', { name: preset.name })
        }
        visible
        disabled={preset === null}
        onClick={() => {
          if (preset === null) return;
          store().remove(preset.id);
          relinkPreset(chatId, null);
        }}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </ActionButton>
    </div>
  );
}
