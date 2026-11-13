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

// ─────────────────────────────
// プロンプトのタブのプリセットの行。画像は会話の画面のアバターで、アシスタント名はカードの欄の変数で直す。
// ─────────────────────────────

/** プリセットの行の props */
export interface PresetUnitRowProps {
  readonly chatId: string;
  readonly chat: Chat;
  /** リンク先。見つからなければ null */
  readonly preset: Preset | null;
}

/** 名前の欄の 1 行。左端はシステムプロンプトの本文の欄（項目の行の字下げ `px-1`）に揃える */
const ROW = 'flex min-w-0 items-center gap-2 pl-1';

/** カードのファイルを選ばせ、会話にリンクする。カードでなければ知らせる */
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

/** 会話の今の欄（写しが無ければ写したプリセットの欄、どちらも無ければ空の欄） */
function fieldsOf(chat: Chat): CharacterFields {
  return characterOf(chat) ?? EMPTY_CHARACTER;
}

/** プリセットの名前の欄と保存・別名保存・削除のアイコンの 1 行 */
export function PresetUnitRow({ chatId, chat, preset }: PresetUnitRowProps): React.ReactElement {
  return (
    <div className={ROW}>
      <div className="min-w-0 flex-1">
        <PresetNameBar
          // リンク先が替わったら、名前の欄を作り直す
          key={`name:${preset?.id ?? ''}`}
          chatId={chatId}
          chat={chat}
          preset={preset}
        />
      </div>
    </div>
  );
}

/**
 * プリセットの名前の欄と、保存・別名保存・削除のアイコン。保存（Enter）は会話の写しと名前でリンク先を
 * 上書きし（リンクしていなければ新しく作る）、別名保存は会話の写しから新しい 1 件を作ってリンクを替える
 */
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
  // 打ちかけの名前はこの欄だけが持つ（リンク先が替わったら作り直す。呼び出し側の key）
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
    // 会話のアバターと個別追加辞書もプリセットに書く
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
    // 会話と同じアバターを指し、個別追加辞書は中身を書く
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
          // リンクを外し、会話のプロンプトを初めの状態に戻す（プリセットはまだ作らない）
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
        // 確かめずに消す。会話の写しと構成は残し、リンクだけ外す
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
