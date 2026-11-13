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

// ─────────────────────────────
// 会話の右の列の設定のタブ。
// ─────────────────────────────

/** 設定のタブの中身。接続は状況を出すだけにし、つなぎ直すのは「LLM に接続する」のダイアログで行う */
export function ChatConnectionPanel(): React.ReactElement {
  // 接続の設定は全体で 1 つ
  const { profileId } = useLlmTarget();
  const baseUrl = useLlmProfilesStore(
    (state) => state.profiles.find((item) => item.id === profileId)?.baseUrl.trim() ?? '',
  );

  return (
    <div className="flex flex-col gap-3 text-xs">
      {/* 接続中の URL と状況。つなぎ直すときは「LLM に接続する」のダイアログで行う */}
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

      {/* 画面の言語と配色（ComfyUI の設定のタブと同じ） */}
      <div className="flex flex-col gap-1">
        <LanguageSelect />
        <ThemeSelect />
        <ChatTabsFirstSwitch />
      </div>

      {/* 会話の画面のアバター */}
      <div className="flex flex-col gap-1">
        <span className={SETTING_HEADING_CLASS}>{t('llm.image.heading')}</span>
        <AvatarField />
      </div>

      {/* 会話の大きさの上限と、一度に描く発言の数 */}
      <div className="flex flex-col gap-1">
        <span className={SETTING_HEADING_CLASS}>{t('llm.limits.heading')}</span>
        <ChatLimitFields />
      </div>

      {/* ComfyUI に控えを書くか */}
      <ComfyBackupField />

      {/* 繰り返し実行と LLM の要求の量の上限（ComfyUI の設定のタブと同じ）。出すだけで変えられない */}
      <div className="flex flex-col gap-1">
        <SafeguardFields />
      </div>

      {/* LLM の分野のログの段階と、ログのエクスポート */}
      <div className="flex flex-col gap-1">
        <DiagnosticsFields area="llm" />
      </div>

      {/* 利用規約を見る・同意を取り消す */}
      <div className="flex flex-col gap-1">
        <TermsFields>
          <CloudAgreementRow />
          <BypassAgreementRow />
        </TermsFields>
      </div>
    </div>
  );
}

/**
 * 会話の画面にプリセットの画像（アバター）を出すか（端末に残す）
 */
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
