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

// ─────────────────────────────
// アバターの画像。置き場は端末の大きい保存領域のアバターの表に
// 1 枚 1 件。画面の中にも全部を持つ。中身のハッシュが同じ画像は足さず、
// 今ある 1 件を返す。消すのは管理のダイアログからだけ。書けなくても画面の中では使える
// ─────────────────────────────

const avatarTable = createLibraryTable('avatar', () => {
  loading = null;
});

/** テストから置き場を差し替える */
export function installAvatarTable(next: ChatTable | null): void {
  avatarTable.install(next);
}

/** 表の 1 件を読む。形が合わなければ null */
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

/** 読み込みを 1 回にまとめる（プリセットの読み込みからも待つ） */
let loading: Promise<void> | null = null;

interface AvatarsState {
  readonly avatars: Readonly<Record<string, Avatar>>;
  /** 置き場から読み終えたか */
  readonly loaded: boolean;
  /** 置き場から読む。何度呼んでも 1 回だけ読む */
  readonly ensure: () => Promise<void>;
  /** 画像を足す。中身が同じ画像があれば足さずにそれを返す */
  readonly add: (image: Blob, name: string) => Promise<Avatar>;
  /**
   * 控えから戻す。同じ id があるか、中身が同じ画像が別の id であれば足さず false
   */
  readonly restore: (avatar: Avatar) => Promise<boolean>;
  /**
   * 表から消す。プリセットと会話の指す先は変えない（戻せばまた出る）
   */
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
    // 長辺を縮めてから比べる（同じ画像は縮めても同じ中身になる）
    const image = await shrinkImage(original);
    const hash = await sha256Hex(image);
    const same = Object.values(get().avatars).find((item) => item.hash === hash);
    if (same !== undefined) return same;
    const avatar: Avatar = { id: newShortId(), name, image, hash, createdAt: Date.now() };
    set({ avatars: { ...get().avatars, [avatar.id]: avatar } });
    try {
      await avatarTable.table().put(avatar.id, avatar);
    } catch {
      // 書けなくても、この画面の中では使える。読み込み直すと消えるので知らせる
      warnUnsaved('library');
    }
    return avatar;
  },

  restore: async (avatar) => {
    const { avatars } = get();
    if (Object.hasOwn(avatars, avatar.id)) return false;
    if (Object.values(avatars).some((item) => item.hash === avatar.hash)) return false;
    // id は控えから来たので、親を差し替えない書き方で足す
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

/** id の画像。無い・指す先が消えていれば null */
export function avatarImageOf(id: string | null | undefined): Blob | null {
  if (id === null || id === undefined) return null;
  return useAvatarsStore.getState().avatars[id]?.image ?? null;
}

/** ファイル名から拡張子を外した名前（アバターの名前に使う） */
export function avatarNameOf(fileName: string): string {
  return withoutExtension(fileName);
}
