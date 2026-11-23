import { stripExpressionChunks } from '@/chat/avatar-expression';
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

const SUBFOLDER = 'kisara';

const HASH_LENGTH = 16;

const placed = new Map<string, string>();

export function imageReferences(chat: Chat | undefined): string[] {
  return [
    AVATAR_REFERENCE,
    ...(chat === undefined ? [] : receivedImages(chat).map((image) => image.reference)),
  ];
}

function avatarOf(chat: Chat | undefined): Blob | null {
  return chat === undefined ? null : avatarImageOf(chatImageId(chat));
}

function extensionOf(type: string): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

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
  const avatar = avatarOf(chat);
  if (avatar === null) return missing;
  const image = await stripExpressionChunks(avatar).catch(() => avatar);
  const value = await place(baseUrl, image).catch(() => null);
  return value === null ? { ok: false, message: t('llm.tool.uploadFailed') } : { ok: true, value };
}

type PlacedValues =
  | { readonly ok: true; readonly values: ArgumentValues }
  | { readonly ok: false; readonly message: string };

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

export function forgetPlacedImages(): void {
  placed.clear();
}
