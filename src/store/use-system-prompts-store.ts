import { create } from 'zustand';

import { parseParams } from '@/chat/file';
import type { SystemPromptTemplate } from '@/chat/types';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import type { GenerationParams } from '@/port/llm-port';
import {
  createLibraryTable,
  restoreOutcomeOf,
  type RestoreOutcome,
} from '@/store/kit/library-table';
import type { ChatTable } from '@/store/persist/chat-repo';

// ─────────────────────────────
// システムプロンプトのテンプレートの一覧。置き場は端末の大きい保存領域の
// テンプレートの表に 1 件ずつ。画面の中にも全部を持つ。
// 書けなくても画面の中では使える
// ─────────────────────────────

const templateTable = createLibraryTable('system-prompt');

/** テストから置き場を差し替える */
export function installSystemPromptTable(next: ChatTable | null): void {
  templateTable.install(next);
}

/** 表の 1 件か控えの 1 件を読む。形が合わなければ null */
export function parseTemplate(raw: unknown): SystemPromptTemplate | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const at = (value: unknown): number => (typeof value === 'number' ? value : 0);
  return {
    id: raw.id,
    name: raw.name,
    content: typeof raw.content === 'string' ? raw.content : '',
    params: parseParams(raw.params),
    createdAt: at(raw.createdAt),
    updatedAt: at(raw.updatedAt),
  };
}

/**
 * 端末に書く。`expected` はこのタブが持っていた版の時刻で、置き場の 1 件がほかのタブで変わって
 * いないかを照合してから書く（新しく足す・控えから戻すときは null で照合しない）
 */
function write(template: SystemPromptTemplate, expected: number | null): void {
  templateTable.write({
    id: template.id,
    value: template,
    expected,
    name: template.name,
    latest: () => useSystemPromptsStore.getState().templates[template.id],
  });
}

interface SystemPromptsState {
  readonly templates: Readonly<Record<string, SystemPromptTemplate>>;
  readonly load: () => Promise<void>;
  /** 新しいテンプレートとして保存する（別名保存） */
  readonly add: (name: string, content: string, params?: GenerationParams) => SystemPromptTemplate;
  /** テンプレートの本文と生成の設定を書き換える（上書き保存） */
  readonly update: (id: string, content: string, params: GenerationParams) => void;
  /** テンプレートの名前を変える */
  readonly rename: (id: string, name: string) => void;
  readonly remove: (id: string) => void;
  /**
   * 控えから戻す。同じ id があれば、最後に変えた時刻（版）の新しい方を残す。
   * 足したら 'added'、置き換えたら 'updated'、一覧のものを残したら null
   */
  readonly restore: (template: SystemPromptTemplate) => RestoreOutcome;
}

export const useSystemPromptsStore = create<SystemPromptsState>()((set, get) => ({
  templates: {},

  load: async () => {
    const found = await templateTable.loadAll(parseTemplate, (template) => template.id);
    set({ templates: { ...found, ...get().templates } });
  },

  add: (name, content, params = {}) => {
    const now = Date.now();
    const template: SystemPromptTemplate = {
      id: newShortId(),
      name,
      content,
      params,
      createdAt: now,
      updatedAt: now,
    };
    set({ templates: { ...get().templates, [template.id]: template } });
    write(template, null);
    return template;
  },

  update: (id, content, params) => {
    const template = get().templates[id];
    if (template === undefined) return;
    const next = { ...template, content, params, updatedAt: Date.now() };
    set({ templates: { ...get().templates, [id]: next } });
    write(next, template.updatedAt);
  },

  rename: (id, name) => {
    const template = get().templates[id];
    if (template === undefined || template.name === name) return;
    const next = { ...template, name, updatedAt: Date.now() };
    set({ templates: { ...get().templates, [id]: next } });
    write(next, template.updatedAt);
  },

  restore: (template) => {
    const outcome = restoreOutcomeOf(get().templates[template.id], template);
    if (outcome === null) return null;
    set({ templates: { ...get().templates, [template.id]: template } });
    write(template, null);
    return outcome;
  },

  remove: (id) => {
    set({ templates: omitKey(get().templates, id) });
    templateTable.remove(id);
  },
}));
