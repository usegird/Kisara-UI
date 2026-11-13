import { chatImageId } from '@/chat/chat-sources';
import { receivedImages } from '@/chat/tool-results';
import type { Chat } from '@/chat/types';
import { imageFileValue } from '@/graph/image-options';
import {
  AVATAR_REFERENCE,
  imageArguments,
  withArgumentValue,
  type ArgumentValues,
  type ToolArgument,
} from '@/graph/workflow-tool';
import { t } from '@/i18n';
import { sha256Hex } from '@/lib/digest';
import { compositeKey } from '@/lib/own-key';
import { comfyPort } from '@/store/ports/comfy-port';
import { avatarImageOf } from '@/store/use-avatars-store';
import { useChatStore } from '@/store/use-chat-store';

// ─────────────────────────────
// 会話から呼んだワークフローの画像の引数。LLM が選んだ参照名を欄の値に差し替える（アバターは
// ComfyUI の `temp/` に置き、受け取った画像は ComfyUI に既にあるので置かずにその値を使う）。
// ─────────────────────────────

/** 置く先の `temp/` の下のサブフォルダ */
const SUBFOLDER = 'kisara';

/** 名前に使うハッシュの字数 */
const HASH_LENGTH = 16;

/** 接続先とハッシュ → 置いた値。このタブの間は置き直さない（端末には残さない） */
const placed = new Map<string, string>();

/** その会話で画像の引数に選べる参照名。アバターが先、受け取った画像が古い順で後 */
export function imageReferences(chat: Chat | undefined): string[] {
  return [
    AVATAR_REFERENCE,
    ...(chat === undefined ? [] : receivedImages(chat).map((image) => image.reference)),
  ];
}

/**
 * 会話が指すアバターの画像。無ければ null
 */
function avatarOf(chat: Chat | undefined): Blob | null {
  return chat === undefined ? null : avatarImageOf(chatImageId(chat));
}

function extensionOf(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

/** 置いて値を返す。覚えていれば置かない */
async function place(baseUrl: string, image: Blob): Promise<string> {
  const hash = (await sha256Hex(image)).slice(0, HASH_LENGTH);
  const key = compositeKey(baseUrl, hash);
  const known = placed.get(key);
  if (known !== undefined) return known;
  const file = new File([image], `${AVATAR_REFERENCE}-${hash}.${extensionOf(image.type)}`, {
    type: image.type,
  });
  const value = await comfyPort().inputImages.uploadTemp(baseUrl, file, SUBFOLDER);
  placed.set(key, value);
  return value;
}

type PlacedValue =
  { readonly ok: true; readonly value: string } | { readonly ok: false; readonly message: string };

/** 参照名の欄の値。アバターは置いた値、受け取った画像はその値 */
async function valueOf(
  chat: Chat | undefined,
  baseUrl: string,
  reference: string,
): Promise<PlacedValue> {
  const missing = { ok: false, message: t('llm.tool.noImage', { name: reference }) } as const;
  if (reference !== AVATAR_REFERENCE) {
    const received = chat === undefined ? undefined : receivedImages(chat);
    const found = received?.find((image) => image.reference === reference);
    return found === undefined ? missing : { ok: true, value: imageFileValue(found.file) };
  }
  const image = avatarOf(chat);
  if (image === null) return missing;
  const value = await place(baseUrl, image).catch(() => null);
  return value === null ? { ok: false, message: t('llm.tool.uploadFailed') } : { ok: true, value };
}

/** 画像の引数を差し替えた値か、置けなかった理由 */
type PlacedValues =
  | { readonly ok: true; readonly values: ArgumentValues }
  | { readonly ok: false; readonly message: string };

/** 画像の引数の参照名を、置いた画像の値に差し替える。画像が無い・置けなければ理由を返す */
export async function placeArgumentImages(
  chatId: string,
  baseUrl: string,
  args: readonly ToolArgument[],
  values: ArgumentValues,
): Promise<PlacedValues> {
  let next = values;
  const chat = useChatStore.getState().chats[chatId];
  for (const { nodeId, input, reference } of imageArguments(args, values)) {
    const value = await valueOf(chat, baseUrl, reference);
    if (!value.ok) return value;
    next = withArgumentValue(next, nodeId, input, value.value);
  }
  return { ok: true, values: next };
}

/** 覚えた値を忘れる（テスト用） */
export function forgetPlacedImages(): void {
  placed.clear();
}
