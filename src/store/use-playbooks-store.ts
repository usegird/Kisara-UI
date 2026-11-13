import { create } from 'zustand';

import type { Playbook } from '@/chat/playbook';
import { parsePlaybook } from '@/chat/playbook-parse';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 自分のプレイブックの一覧（端末の大きい保存領域に 1 冊 1 件。画面の中にも全部を持ち、書けなくても使える）。
// 会話は選んだときに写しを持つので、ここで直す・消すのは会話に効かない。
// ─────────────────────────────

/** 一覧の 1 冊。持ち物の `id` は一覧の id と同じにし、`origin` は 'own' */
export interface OwnPlaybook {
  readonly id: string;
  readonly playbook: Playbook;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const playbookTable = createLibraryTable('playbook');

/** テストから置き場を差し替える */
export function installPlaybookTable(next: ChatTable | null): void {
  playbookTable.install(next);
}

/** 表の 1 件か控えの 1 件を読む。形が合わなければ null */
export function parseOwnPlaybook(raw: unknown): OwnPlaybook | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const playbook = parsePlaybook(raw.playbook);
  if (playbook === null) return null;
  const at = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    id: raw.id,
    playbook: { ...playbook, id: raw.id, origin: 'own' },
    createdAt: at(raw.createdAt),
    updatedAt: at(raw.updatedAt),
  };
}

/**
 * 端末に書く。`expected` はこのタブが持っていた版の時刻で、置き場の 1 冊がほかのタブで変わって
 * いないかを照合してから書く（新しく足す・控えから戻すときは null で照合しない）
 */
function write(item: OwnPlaybook, expected: number | null): void {
  playbookTable.write({
    id: item.id,
    value: item,
    expected,
    name: item.playbook.name,
    latest: () => usePlaybooksStore.getState().playbooks[item.id],
  });
}

interface PlaybooksState {
  readonly playbooks: Readonly<Record<string, OwnPlaybook>>;
  /** 表を読み終えたか（読み終える前の変化を控えに書かない） */
  readonly loaded: boolean;
  readonly load: () => Promise<void>;
  /** 新しい 1 冊として足す（写して作る）。id を振り直して返す */
  readonly add: (playbook: Playbook) => OwnPlaybook;
  /** 1 冊を書き換える（直す） */
  readonly update: (id: string, playbook: Playbook) => void;
  readonly remove: (id: string) => void;
  /**
   * 控えから戻す。同じ id があれば、最後に変えた時刻（版）の新しい方を残す。
   * 足したら 'added'、置き換えたら 'updated'、一覧のものを残したら null
   */
  readonly restore: (item: OwnPlaybook) => RestoreOutcome;
}

export const usePlaybooksStore = create<PlaybooksState>()((set, get) => ({
  playbooks: {},
  loaded: false,

  load: async () => {
    const found = await playbookTable.loadAll(parseOwnPlaybook, (item) => item.id);
    const playbooks = { ...found, ...get().playbooks };
    set({ playbooks, loaded: true });
    // 外した鍵に、もう無い自分のプレイブックがあれば外す（ほかのタブで消した分。辞書と同じ）
    useSettingsStore.getState().keepOwnPlaybookIds(new Set(Object.keys(playbooks)));
  },

  add: (playbook) => {
    const now = Date.now();
    const id = newShortId();
    const item: OwnPlaybook = {
      id,
      playbook: { ...playbook, id, origin: 'own' },
      createdAt: now,
      updatedAt: now,
    };
    set({ playbooks: { ...get().playbooks, [id]: item } });
    write(item, null);
    return item;
  },

  update: (id, playbook) => {
    const item = get().playbooks[id];
    if (item === undefined) return;
    const next = {
      ...item,
      playbook: { ...playbook, id, origin: 'own' as const },
      updatedAt: Date.now(),
    };
    set({ playbooks: { ...get().playbooks, [id]: next } });
    write(next, item.updatedAt);
  },

  restore: (item) => {
    const outcome = restoreOutcomeOf(get().playbooks[item.id], item);
    if (outcome === null) return null;
    set({ playbooks: { ...get().playbooks, [item.id]: item } });
    write(item, null);
    return outcome;
  },

  remove: (id) => {
    set({ playbooks: omitKey(get().playbooks, id) });
    playbookTable.remove(id);
  },
}));
