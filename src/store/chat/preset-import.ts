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

// ─────────────────────────────
// キャラクターカードを開くと、プリセットを会話に写す。落とした・
// 選んだファイルがカードなら、プリセットに変えて一覧に足し、その欄を写した新しい会話を会話のタブで開く。
// 個別追加辞書は中身を写し、アバターは id を写してプリセットと共有する
// ─────────────────────────────

/** 取り込んだ会話の利用者の情報（名前だけ。`{{user}}` の既定と同じ） */
const DEFAULT_PERSONA = { name: NO_SOURCES.userName, description: '' };

/** ファイルがカードなら開いて true。カードでなければ何もせず false（ワークフローとして開く側へ） */
export async function openCardFile(file: File): Promise<boolean> {
  // 大きすぎるものはカードとして読まない（ワークフローとして開く側が、その上限で断る）
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
      // 変数の `{{user}}` に既定の名前を入れておく（`{{char}}` はカードの名前）
      persona: DEFAULT_PERSONA,
      // カードにある欄だけで構成を作る（KisaraUI の初めの構成の項目は使わない）
      prompt: cardComposition(view),
      messages: greeting === null ? [] : [greeting],
    },
    useChatStore.getState().places[chatId],
  );
  useTabsStore.getState().openExistingChat(chatId);
  // 読み込んだカードの中身を見られるよう、右の列をプロンプトのタブにし、有効な項目を開いて出す
  useChatSidePanelStore.getState().setTab('prompt');
  useChatSidePanelStore.getState().requestExpand(chatId);
  return true;
}

/**
 * 会話でプリセットを選ぶ。欄を会話に写し、カードから開いたときと同じく
 * 構成を欄で作り直す（KisaraUI の初めの構成の項目は使わない）。会話のシステムプロンプトは残す
 */
export function linkPreset(chatId: string, presetId: string): void {
  const preset = usePresetsStore.getState().presets[presetId];
  const persona = useChatStore.getState().chats[chatId]?.persona ?? null;
  if (preset === undefined) return;
  useChatStore.getState().update(chatId, {
    preset: { id: preset.id, name: preset.name },
    character: preset.fields,
    // 個別追加辞書の並びは中身を写し、アバターは id を写す（以後プリセットを読まない）
    lorebooks: preset.lorebooks,
    imageId: preset.imageId,
    // 利用者の情報が無ければ、変数の `{{user}}` に既定の名前を入れておく
    persona: persona ?? DEFAULT_PERSONA,
    prompt: cardComposition(characterView(preset.fields, presetLorebook(preset))),
  });
  // 取り込んだ結果が見えるよう、中身のある有効な項目を開いて出す
  useChatSidePanelStore.getState().requestExpand(chatId);
}

/**
 * 会話の写しの欄を直す。プリセットは変えない。写しが無ければ、写したプリセットの欄
 * （無ければ空の欄）から写しを作って直す
 */
export function editCharacter(chatId: string, patch: Partial<CharacterFields>): void {
  replaceCharacter(chatId, (current) => ({ ...current, ...patch }));
}

/** 写しの欄を作り直す（鍵を外す直しにも使う）。写しの無いときは editCharacter と同じ */
function replaceCharacter(
  chatId: string,
  edit: (current: CharacterFields) => CharacterFields,
): void {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return;
  const current = characterOf(chat) ?? EMPTY_CHARACTER;
  useChatStore.getState().update(chatId, { character: edit(current) });
}

/** カードをつないだ結果。カードでない・大きすぎて読まなかったときは理由 */
type LinkCardResult = 'linked' | 'not-card' | 'too-large';

/** ファイルのカードをプリセットの一覧に足して、会話にリンクする */
export async function linkCardFile(chatId: string, file: File): Promise<LinkCardResult> {
  if (isTooLarge(file, CARD_FILE_MAX_BYTES)) return 'too-large';
  const read = readCard(await file.arrayBuffer());
  if (read === null) return 'not-card';
  const preset = await usePresetsStore.getState().addCard(read.card, read.png ? file : null);
  linkPreset(chatId, preset.id);
  return 'linked';
}

/** 一覧の名前と重ならない名前（一覧を名前で引くため） */
export function freePresetName(base: string): string {
  return uniqueName(
    base,
    Object.values(usePresetsStore.getState().presets).map((item) => item.name),
  );
}

/** 会話のリンクを替える（欄は写し直さず、構成も作り直さない） */
export function relinkPreset(chatId: string, preset: Preset | null): void {
  useChatStore
    .getState()
    .update(chatId, { preset: preset === null ? null : { id: preset.id, name: preset.name } });
}

/**
 * 会話の写しから新しいプリセットを作り、会話をリンクする。名前は
 * 「新しいプリセット」（重なれば番号）。構成は作り直さない
 */
export function linkNewPreset(chatId: string, imageId?: string | null): void {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined) return;
  const name = freePresetName(t('llm.prompt.preset.untitled'));
  const fields = characterOf(chat) ?? EMPTY_CHARACTER;
  // 会話のアバターを新しいプリセットも指し、個別追加辞書は中身を書く
  const image = imageId === undefined ? chatImageId(chat) : imageId;
  const created = usePresetsStore.getState().add(name, fields, image, chatLorebooks(chat));
  relinkPreset(chatId, created);
  useChatStore.getState().update(chatId, { imageId: image });
}

/**
 * プリセットの「新しく作成する」。リンクを外し、会話のプロンプト（構成・写し）を
 * 初めの状態に戻す。プリセットはまだ作らない
 */
export function resetPrompt(chatId: string): void {
  useChatStore.getState().update(chatId, {
    preset: null,
    character: null,
    prompt: defaultComposition(),
  });
}
