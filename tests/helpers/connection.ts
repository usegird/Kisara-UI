// ─────────────────────────────
// ComfyUI につないだ状態の決め打ち。控えのように、接続先と設定を同時に決めたい確認で使う
// ─────────────────────────────

import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore, type SettingsState } from '@/store/use-settings-store';
import { NOTICE_REVISION, TERMS_REVISION, useTermsStore } from '@/store/use-terms-store';

/**
 * 今の取り直す版に同意した状態にする（同意するまで ComfyUI にはつながない）
 */
export function acceptTerms(): void {
  useTermsStore.setState({
    accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-15T00:00:00.000Z' },
    notice: { revision: NOTICE_REVISION, acceptedAt: '2026-10-15T00:00:00.000Z' },
  });
}

/** ComfyUI につなぐ。`settings` は接続先と同時に決める設定（控えを書くか、など） */
export function connectComfy(
  settings: Partial<SettingsState> = {},
  baseUrl = 'http://comfy',
): void {
  useSettingsStore.setState({ baseUrl, ...settings });
  useConnectionStore.setState({ status: 'connected' });
}
