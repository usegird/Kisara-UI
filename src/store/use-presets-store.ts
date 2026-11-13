import { create } from 'zustand';

import { cardFields, cardLorebook, parseCharacterFields } from '@/chat/card';
import { parseLorebooks } from '@/chat/dictionary';
import {
  lorebookEntries,
  lorebookList,
  savedLorebooks,
  type LoreEntry,
  type OwnLorebook,
} from '@/chat/lore';
import type { CharacterFields, Preset } from '@/chat/types';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { useAvatarsStore } from '@/store/use-avatars-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { warnUnsaved } from '@/store/use-storage-warnings-store';

// ─────────────────────────────
// プリセット（会話に写す文字の欄と個別追加辞書の組）の一覧。端末の大きい保存領域に 1 件ずつ置き、
// 画面の中にも全部を持つ（書けなくても使える）。画像はアバターの表に置き、id で指す。
// ─────────────────────────────

/** プリセットの表 */
const presetTable = createLibraryTable('preset');

/** テストから置き場を差し替える */
export function installPresetTable(next: ChatTable | null): void {
  presetTable.install(next);
}

/** 表の 1 件か控えの 1 件を読む。形が合わなければ null */
export function parsePreset(raw: unknown): Preset | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const fields = parseCharacterFields(raw.fields);
  if (fields === null) return null;
  const at = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : fields.name,
    fields,
    imageId: typeof raw.imageId === 'string' ? raw.imageId : null,
    lorebooks: savedLorebooks(parseLorebooks(raw.lorebooks) ?? []),
    createdAt: at(raw.createdAt),
    updatedAt: at(raw.updatedAt),
  };
}

/** プリセットの個別追加辞書のすべての項目。無ければ空 */
export function presetLorebook(preset: Preset | undefined): readonly LoreEntry[] {
  return lorebookEntries(preset?.lorebooks ?? []);
}

/** 中身が同じプリセットか（読み込んだカードを二重に足さない。画像は中身で揃えた id で比べる） */
function sameContent(
  preset: Preset,
  fields: CharacterFields,
  lorebooks: readonly OwnLorebook[],
  imageId: string | null,
): boolean {
  return (
    JSON.stringify(preset.fields) === JSON.stringify(fields) &&
    JSON.stringify(preset.lorebooks) === JSON.stringify(lorebooks) &&
    preset.imageId === imageId
  );
}

/**
 * 会話から書くもの（保存。個別追加辞書の並びは中身、アバターは id）。並びは
 * 会話で切った印を落として書く
 */
interface PresetRefs {
  readonly imageId: string | null;
  readonly lorebooks: readonly OwnLorebook[];
}

interface PresetsState {
  readonly presets: Readonly<Record<string, Preset>>;
  /** 置き場から読み終えたか（読む前は、リンク先が見つからないと決めつけない） */
  readonly loaded: boolean;
  readonly load: () => Promise<void>;
  /** 読み込んだキャラクターカードをプリセットに変えて足す。同じ中身のプリセットがあればそれを返す */
  readonly addCard: (card: Record<string, unknown>, image: Blob | null) => Promise<Preset>;
  /** 新しい 1 件を足す（空のプリセット・別名保存。名前が同じでも毎回作る）。返り値は新しい 1 件 */
  readonly add: (
    name: string,
    fields: CharacterFields,
    imageId: string | null,
    lorebooks: readonly OwnLorebook[],
  ) => Preset;
  /**
   * 会話の写しの欄・名前と、会話のアバター・個別追加辞書で上書きする（保存）
   */
  readonly update: (id: string, name: string, fields: CharacterFields, refs: PresetRefs) => void;
  /**
   * 一覧から消す（端末から消す。ComfyUI の控えは残る）
   */
  readonly remove: (id: string) => void;
  /** 画像（アバターの id）を替える・外す（このプリセットから写した会話すべての画像が替わる） */
  readonly setImage: (id: string, imageId: string | null) => void;
  /**
   * 控えから戻す。同じ id があれば、最後に変えた時刻（版）の新しい方を残す。
   * 足したら 'added'、置き換えたら 'updated'、一覧のものを残したら null
   */
  readonly restore: (preset: Preset) => Promise<RestoreOutcome>;
}

/** 新しいプリセット。作った時刻と最後に変えた時刻は今 */
function newPresetOf(
  name: string,
  fields: CharacterFields,
  imageId: string | null,
  lorebooks: Preset['lorebooks'],
): Preset {
  const now = Date.now();
  return { id: newShortId(), name, fields, imageId, lorebooks, createdAt: now, updatedAt: now };
}

export const usePresetsStore = create<PresetsState>()((set, get) => {
  /**
   * 一覧に入れて端末に書く。書けなくても、この画面の中では使える。持っていた 1 件を直すときは、
   * 置き場の 1 件がほかのタブで変わっていないかを照合してから書く
   */
  const put = (preset: Preset): void => {
    const expected = get().presets[preset.id]?.updatedAt ?? null;
    set({ presets: { ...get().presets, [preset.id]: preset } });
    presetTable.write({
      id: preset.id,
      value: preset,
      expected,
      name: preset.name,
      latest: () => get().presets[preset.id],
    });
  };

  /** 一覧に入れて端末に書く（照合しない）。書けなければ、読み込み直すと消えるので警告する */
  const putUnchecked = async (preset: Preset): Promise<void> => {
    set({ presets: { ...get().presets, [preset.id]: preset } });
    try {
      await presetTable.table().put(preset.id, preset);
    } catch {
      warnUnsaved('library');
    }
  };

  return {
    presets: {},
    loaded: false,

    load: async () => {
      // プリセットが指すアバターと、全体の追加辞書の表も一緒に読む
      await Promise.all([
        useAvatarsStore.getState().ensure(),
        useDictionariesStore.getState().loaded
          ? Promise.resolve()
          : useDictionariesStore.getState().load(),
      ]);
      const found = await presetTable.loadAll(parsePreset, (preset) => preset.id);
      set({ presets: { ...found, ...get().presets }, loaded: true });
    },

    addCard: async (card, image) => {
      const fields = cardFields(card);
      // カードのロアブックと Character's Note は個別追加辞書の 1 冊にして中に持つ
      const lorebooks = lorebookList(cardLorebook(card));
      const imageId =
        image === null ? null : (await useAvatarsStore.getState().add(image, fields.name)).id;
      const same = Object.values(get().presets).find((item) =>
        sameContent(item, fields, lorebooks, imageId),
      );
      if (same !== undefined) return same;
      const preset = newPresetOf(fields.name, fields, imageId, lorebooks);
      await putUnchecked(preset);
      return preset;
    },

    add: (name, fields, imageId, lorebooks) => {
      const preset = newPresetOf(name, fields, imageId, savedLorebooks(lorebooks));
      put(preset);
      return preset;
    },

    update: (id, name, fields, refs) => {
      const preset = get().presets[id];
      if (preset === undefined) return;
      const lorebooks = savedLorebooks(refs.lorebooks);
      put({ ...preset, name, fields, ...refs, lorebooks, updatedAt: Date.now() });
    },

    setImage: (id, imageId) => {
      const preset = get().presets[id];
      if (preset !== undefined) put({ ...preset, imageId, updatedAt: Date.now() });
    },

    restore: async (preset) => {
      const outcome = restoreOutcomeOf(get().presets[preset.id], preset);
      if (outcome !== null) await putUnchecked(preset);
      return outcome;
    },

    remove: (id) => {
      set({ presets: omitKey(get().presets, id) });
      presetTable.remove(id);
    },
  };
});
