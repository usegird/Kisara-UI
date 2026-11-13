import type { StateCreator } from 'zustand';

import {
  CHAT_IMAGE_SIZE,
  normalizeChatImageFocus,
  normalizeChatImageSize,
} from '@/store/settings-fields/chat-image';
import { normalizingSetterOf, setterOf } from '@/store/settings-fields/settings-table';
import type { SettingsState } from '@/store/use-settings-store';

// ─────────────────────────────
// 設定のストアの、会話の設定（ComfyUI の控えと呼べるワークフロー・送る形・大きさの上限・アバターの画像・タブの並び）の操作。
// ─────────────────────────────

/** この slice が持つ操作 */
type SettingsChatActions = Pick<
  SettingsState,
  | 'setChatComfyBackup'
  | 'setChatComfyTools'
  | 'setChatComfyToolsSkipConfirm'
  | 'setChatComfyToolsArgGuide'
  | 'addChatComfyToolTarget'
  | 'removeChatComfyToolTarget'
  | 'updateChatComfyToolTarget'
  | 'setSquashSystemMessages'
  | 'setChatMaxMegabytes'
  | 'setChatLogWindow'
  | 'setChatShowAvatar'
  | 'setChatTabsFirst'
  | 'setChatImagePlace'
  | 'setChatImageFocus'
  | 'setChatImageSize'
>;

/** 会話の設定（ComfyUI の控えと呼べるワークフロー・送る形・大きさの上限・アバターの画像・タブの並び）の操作を作る */
export const createSettingsChatSlice: StateCreator<
  SettingsState,
  [['zustand/persist', unknown]],
  [],
  SettingsChatActions
> = (set) => ({
  setChatComfyBackup: setterOf(set, 'chatComfyBackup'),
  setChatComfyTools: setterOf(set, 'chatComfyTools'),
  setChatComfyToolsSkipConfirm: setterOf(set, 'chatComfyToolsSkipConfirm'),
  setChatComfyToolsArgGuide: setterOf(set, 'chatComfyToolsArgGuide'),
  addChatComfyToolTarget: (target) =>
    set((state) =>
      state.chatComfyToolTargets.some((item) => item.tabId === target.tabId)
        ? state
        : { chatComfyToolTargets: [...state.chatComfyToolTargets, target] },
    ),
  removeChatComfyToolTarget: (id) =>
    set((state) => ({
      chatComfyToolTargets: state.chatComfyToolTargets.filter((item) => item.id !== id),
    })),
  updateChatComfyToolTarget: (id, patch) =>
    set((state) => ({
      chatComfyToolTargets: state.chatComfyToolTargets.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  setSquashSystemMessages: setterOf(set, 'squashSystemMessages'),
  setChatMaxMegabytes: normalizingSetterOf(set, 'chatMaxMegabytes'),
  setChatLogWindow: normalizingSetterOf(set, 'chatLogWindow'),
  setChatShowAvatar: setterOf(set, 'chatShowAvatar'),
  setChatTabsFirst: setterOf(set, 'chatTabsFirst'),
  setChatImagePlace: setterOf(set, 'chatImagePlace'),
  setChatImageFocus: (x, y) =>
    set({
      chatImageFocusX: normalizeChatImageFocus(x),
      chatImageFocusY: normalizeChatImageFocus(y),
    }),
  setChatImageSize: (width, height) =>
    set({
      chatImageWidth: normalizeChatImageSize(width, CHAT_IMAGE_SIZE.width),
      chatImageHeight: normalizeChatImageSize(height, CHAT_IMAGE_SIZE.height),
    }),
});
