import { create } from 'zustand';

import {
  hasExpressionManifest,
  hasExpressions,
  readExpressionSet,
  writeExpressionSet,
  type ExpressionRead,
  type ExpressionSet,
} from '@/chat/avatar-expression';
import { toPngImage } from '@/lib/image-attach';
import { omitKey, setOwn } from '@/lib/own-key';
import { useAvatarsStore } from '@/store/use-avatars-store';

export interface ExpressionEntry {
  readonly hash: string;
  readonly read: ExpressionRead;
}

export type ExpressionSaveResult = 'saved' | 'unchanged' | 'failed';

interface AvatarExpressionsState {
  readonly reads: Readonly<Record<string, ExpressionEntry>>;
  readonly marks: Readonly<Record<string, { readonly hash: string; readonly has: boolean }>>;
  readonly ensureMark: (avatarId: string) => void;
  readonly ensure: (avatarId: string) => void;
  readonly save: (avatarId: string, set: ExpressionSet) => Promise<ExpressionSaveResult>;
}

const reading = new Set<string>();

export const useAvatarExpressionsStore = create<AvatarExpressionsState>()((set, get) => ({
  reads: {},
  marks: {},

  ensureMark: (avatarId) => {
    const avatar = useAvatarsStore.getState().avatars[avatarId];
    if (avatar === undefined || get().marks[avatarId]?.hash === avatar.hash) return;
    const key = `mark:${avatarId}:${avatar.hash}`;
    if (reading.has(key)) return;
    reading.add(key);
    void hasExpressionManifest(avatar.image)
      .catch(() => false)
      .then((has) => {
        reading.delete(key);
        if (useAvatarsStore.getState().avatars[avatarId]?.hash !== avatar.hash) return;
        const marks = { ...get().marks };
        setOwn(marks, avatarId, { hash: avatar.hash, has });
        set({ marks });
      });
  },

  ensure: (avatarId) => {
    const avatar = useAvatarsStore.getState().avatars[avatarId];
    if (avatar === undefined) return;
    if (get().reads[avatarId]?.hash === avatar.hash) return;
    const key = `${avatarId}:${avatar.hash}`;
    if (reading.has(key)) return;
    reading.add(key);
    void readExpressionSet(avatar.image)
      .catch((): ExpressionRead => ({ kind: 'unreadable' }))
      .then((read) => {
        reading.delete(key);
        if (useAvatarsStore.getState().avatars[avatarId]?.hash !== avatar.hash) return;
        const reads = { ...get().reads };
        setOwn(reads, avatarId, { hash: avatar.hash, read });
        set({ reads });
      });
  },

  save: async (avatarId, next) => {
    const avatar = useAvatarsStore.getState().avatars[avatarId];
    const fallback = next.items.find((item) => item.label === next.defaultLabel);
    if (avatar === undefined || fallback === undefined) return 'failed';
    if (
      !hasExpressions(next) &&
      fallback.image === avatar.image &&
      avatar.image.type !== 'image/png'
    ) {
      return 'unchanged';
    }
    try {
      const defaultPng = await toPngImage(fallback.image);
      if (defaultPng === null) return 'failed';
      const image = await writeExpressionSet(avatar.image, defaultPng, next);
      await useAvatarsStore.getState().replaceImage(avatarId, image);
    } catch (error) {
      console.error('[表情差分]', error);
      return 'failed';
    }
    set({ reads: omitKey(get().reads, avatarId) });
    get().ensure(avatarId);
    return 'saved';
  },
}));

export function expressionLabelsOf(avatarId: string | null): string[] {
  if (avatarId === null) return [];
  const read = useAvatarExpressionsStore.getState().reads[avatarId]?.read;
  if (read?.kind !== 'ok' || !hasExpressions(read.set)) return [];
  return read.set.items.map((item) => item.label);
}
