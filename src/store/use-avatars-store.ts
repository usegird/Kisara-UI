import { create } from 'zustand';

import type { Avatar } from '@/chat/types';
import { sha256Hex } from '@/lib/digest';
import { withoutExtension } from '@/lib/file-name';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { shrinkImage } from '@/lib/image-attach';
import { omitKey, setOwn } from '@/lib/own-key';
import { createLibraryTable } from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { warnUnsaved } from '@/store/use-storage-warnings-store';

const avatarTable = createLibraryTable('avatar', () => {
  loading = null;
});

export function installAvatarTable(next: ChatTable | null): void {
  avatarTable.install(next);
}

function parseAvatar(raw: unknown): Avatar | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !(raw.image instanceof Blob)) return null;
  if (typeof raw.hash !== 'string') return null;
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '',
    image: raw.image,
    hash: raw.hash,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
  };
}

let loading: Promise<void> | null = null;

interface AvatarsState {
  readonly avatars: Readonly<Record<string, Avatar>>;
  readonly loaded: boolean;
  readonly ensure: () => Promise<void>;
  readonly add: (image: Blob, name: string) => Promise<Avatar>;
  readonly restore: (avatar: Avatar) => Promise<boolean>;
  readonly remove: (id: string) => void;
}

export const useAvatarsStore = create<AvatarsState>()((set, get) => ({
  avatars: {},
  loaded: false,

  ensure: () => {
    loading ??= (async () => {
      const found = await avatarTable.loadAll(parseAvatar, (avatar) => avatar.id);
      set({ avatars: { ...found, ...get().avatars }, loaded: true });
    })();
    return loading;
  },

  add: async (original, name) => {
    const image = await shrinkImage(original);
    const hash = await sha256Hex(image);
    const same = Object.values(get().avatars).find((item) => item.hash === hash);
    if (same !== undefined) return same;
    const avatar: Avatar = { id: newShortId(), name, image, hash, createdAt: Date.now() };
    set({ avatars: { ...get().avatars, [avatar.id]: avatar } });
    try {
      await avatarTable.table().put(avatar.id, avatar);
    } catch {
      warnUnsaved('library');
    }
    return avatar;
  },

  restore: async (avatar) => {
    const { avatars } = get();
    if (Object.hasOwn(avatars, avatar.id)) return false;
    if (Object.values(avatars).some((item) => item.hash === avatar.hash)) return false;
    const next = { ...avatars };
    setOwn(next, avatar.id, avatar);
    set({ avatars: next });
    try {
      await avatarTable.table().put(avatar.id, avatar);
    } catch {
      warnUnsaved('library');
    }
    return true;
  },

  remove: (id) => {
    set({ avatars: omitKey(get().avatars, id) });
    void avatarTable
      .table()
      .delete(id)
      .catch(() => undefined);
  },
}));

export function avatarImageOf(id: string | null | undefined): Blob | null {
  if (id === null || id === undefined) return null;
  return useAvatarsStore.getState().avatars[id]?.image ?? null;
}

export function avatarNameOf(fileName: string): string {
  return withoutExtension(fileName);
}
