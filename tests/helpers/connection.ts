import { useConnectionStore } from '@/store/use-connection-store';
import { useSettingsStore, type SettingsState } from '@/store/use-settings-store';
import { NOTICE_REVISION, TERMS_REVISION, useTermsStore } from '@/store/use-terms-store';

export function acceptTerms(): void {
  useTermsStore.setState({
    accepted: { revision: TERMS_REVISION, acceptedAt: '2026-10-15T00:00:00.000Z' },
    notice: { revision: NOTICE_REVISION, acceptedAt: '2026-10-15T00:00:00.000Z' },
  });
}

export function connectComfy(
  settings: Partial<SettingsState> = {},
  baseUrl = 'http://comfy',
): void {
  useSettingsStore.setState({ baseUrl, ...settings });
  useConnectionStore.setState({ status: 'connected' });
}
