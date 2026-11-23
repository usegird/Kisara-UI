import { cardComposition, characterView, EMPTY_CHARACTER } from '@/chat/card';
import { greetingMessage } from '@/chat/card-greeting';
import { CARD_FILE_MAX_BYTES, readCard } from '@/chat/card-read';
import { characterOf, chatImageId, chatLorebooks, chatNameSources } from '@/chat/chat-sources';
import { NO_SOURCES } from '@/chat/macros';
import { defaultComposition, type CharacterFields, type Preset } from '@/chat/types';
import { t } from '@/i18n';
import { isTooLarge } from '@/lib/file-size';
import { newShortId } from '@/lib/id';
import { uniqueName } from '@/lib/unique-name';
import { useChatSidePanelStore } from '@/store/use-chat-side-panel-store';
import { useChatStore } from '@/store/use-chat-store';
import { presetLorebook, usePresetsStore } from '@/store/use-presets-store';
import { useTabsStore } from '@/store/use-tabs-store';

const DEFAULT_PERSONA = { name: NO_SOURCES.userName, description: '' };

export async function openCardFile(file: File): Promise<boolean> {
  if (isTooLarge(file, CARD_FILE_MAX_BYTES)) return false;
  const read = readCard(await file.arrayBuffer());
  if (read === null) return false;
  const preset = await usePresetsStore.getState().addCard(read.card, read.png ? file : null);
  const view = characterView(preset.fields, presetLorebook(preset));

  const chats = useChatStore.getState();
  const chatId = chats.add();
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return true;
  const greeting = greetingMessage(view, newShortId(), chatNameSources(view, null));
  chats.put(
    chatId,
    {
      ...chat,
      name: view.name,
      preset: { id: preset.id, name: preset.name },
      character: preset.fields,
      lorebooks: preset.lorebooks,
      imageId: preset.imageId,
      persona: DEFAULT_PERSONA,
      prompt: cardComposition(view),
      messages: greeting === null ? [] : [greeting],
    },
    useChatStore.getState().places[chatId],
  );
  useTabsStore.getState().openExistingChat(chatId);
  useChatSidePanelStore.getState().setTab('prompt');
  useChatSidePanelStore.getState().requestExpand(chatId);
  return true;
}

export function linkPreset(chatId: string, presetId: string): void {
  const preset = usePresetsStore.getState().presets[presetId];
  const persona = useChatStore.getState().chats[chatId]?.persona ?? null;
  if (preset === undefined) return;
  useChatStore.getState().update(chatId, {
    preset: { id: preset.id, name: preset.name },
    character: preset.fields,
    lorebooks: preset.lorebooks,
    imageId: preset.imageId,
    persona: persona ?? DEFAULT_PERSONA,
    prompt: cardComposition(characterView(preset.fields, presetLorebook(preset))),
  });
  useChatSidePanelStore.getState().requestExpand(chatId);
}

export function editCharacter(chatId: string, patch: Partial<CharacterFields>): void {
  replaceCharacter(chatId, (current) => ({ ...current, ...patch }));
}

function replaceCharacter(
  chatId: string,
  edit: (current: CharacterFields) => CharacterFields,
): void {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return;
  const current = characterOf(chat) ?? EMPTY_CHARACTER;
  useChatStore.getState().update(chatId, { character: edit(current) });
}

type LinkCardResult = 'linked' | 'not-card' | 'too-large';

export async function linkCardFile(chatId: string, file: File): Promise<LinkCardResult> {
  if (isTooLarge(file, CARD_FILE_MAX_BYTES)) return 'too-large';
  const read = readCard(await file.arrayBuffer());
  if (read === null) return 'not-card';
  const preset = await usePresetsStore.getState().addCard(read.card, read.png ? file : null);
  linkPreset(chatId, preset.id);
  return 'linked';
}

export function freePresetName(base: string): string {
  return uniqueName(
    base,
    Object.values(usePresetsStore.getState().presets).map((item) => item.name),
  );
}

export function relinkPreset(chatId: string, preset: Preset | null): void {
  useChatStore
    .getState()
    .update(chatId, { preset: preset === null ? null : { id: preset.id, name: preset.name } });
}

export function linkNewPreset(chatId: string, imageId?: string | null): void {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return;
  const name = freePresetName(t('llm.prompt.preset.untitled'));
  const fields = characterOf(chat) ?? EMPTY_CHARACTER;
  const image = imageId === undefined ? chatImageId(chat) : imageId;
  const created = usePresetsStore.getState().add(name, fields, image, chatLorebooks(chat));
  relinkPreset(chatId, created);
  useChatStore.getState().update(chatId, { imageId: image });
}

export function resetPrompt(chatId: string): void {
  useChatStore.getState().update(chatId, {
    preset: null,
    character: null,
    prompt: defaultComposition(),
  });
}
