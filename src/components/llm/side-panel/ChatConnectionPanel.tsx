import { ChatLimitFields } from '@/components/llm/side-panel/ChatLimitFields';
import {
  BypassAgreementRow,
  CloudAgreementRow,
} from '@/components/llm/side-panel/CloudAgreementRow';
import { ComfyBackupField } from '@/components/llm/side-panel/ComfyBackupField';
import {
  LlmConnectionError,
  LlmConnectionNotice,
} from '@/components/llm/side-panel/LlmEndpointField';
import {
  ChatTabsFirstSwitch,
  LanguageSelect,
  SETTING_HEADING_CLASS,
  ThemeSelect,
} from '@/components/ui/appearance-fields';
import { DiagnosticsFields } from '@/components/ui/diagnostics-fields';
import { SafeguardFields } from '@/components/ui/safeguard-fields';
import { SettingSwitch } from '@/components/ui/setting-switch';
import { TermsFields } from '@/components/ui/terms-dialog';
import { useLlmTarget } from '@/hooks/chat/use-llm-target';
import { t } from '@/i18n';
import { useLlmConnectDialogStore } from '@/store/use-llm-connect-dialog-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

export function ChatConnectionPanel(): React.ReactElement {
  const { profileId } = useLlmTarget();
  const baseUrl = useLlmProfilesStore(
    (state) => state.profiles.find((item) => item.id === profileId)?.baseUrl.trim() ?? '',
  );

  return (
    <div className="flex flex-col gap-3 text-xs">
      <div className="flex flex-col gap-2">
        <span className={SETTING_HEADING_CLASS}>{t('llm.connection.baseUrl')}</span>
        <p className="truncate px-1 font-mono" title={baseUrl || undefined}>
          {baseUrl.length > 0 ? baseUrl : t('llm.connection.none')}
        </p>
        <div className="flex flex-wrap items-center gap-2 px-1">
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded-md px-3 py-1"
            onClick={() => useLlmConnectDialogStore.getState().open()}
          >
            {t('llm.connection.reconnect')}
          </button>
          <LlmConnectionNotice profileId={profileId} />
        </div>
        <LlmConnectionError profileId={profileId} />
      </div>

      <div className="flex flex-col gap-1">
        <LanguageSelect />
        <ThemeSelect />
        <ChatTabsFirstSwitch />
      </div>

      <div className="flex flex-col gap-1">
        <span className={SETTING_HEADING_CLASS}>{t('llm.image.heading')}</span>
        <AvatarField />
      </div>

      <div className="flex flex-col gap-1">
        <span className={SETTING_HEADING_CLASS}>{t('llm.limits.heading')}</span>
        <ChatLimitFields />
      </div>

      <ComfyBackupField />

      <div className="flex flex-col gap-1">
        <SafeguardFields />
      </div>

      <div className="flex flex-col gap-1">
        <DiagnosticsFields area="llm" />
      </div>

      <div className="flex flex-col gap-1">
        <TermsFields>
          <CloudAgreementRow />
          <BypassAgreementRow />
        </TermsFields>
      </div>
    </div>
  );
}

function AvatarField(): React.ReactElement {
  const show = useSettingsStore((state) => state.chatShowAvatar);
  return (
    <SettingSwitch
      checked={show}
      onChange={(next) => useSettingsStore.getState().setChatShowAvatar(next)}
      label={t('llm.image.show')}
      spaced={false}
    />
  );
}
