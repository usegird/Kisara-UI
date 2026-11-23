import { ConnectionBar } from '@/components/comfy/ConnectionBar';
import { SlideshowSecondsField } from '@/components/comfy/queue/SlideshowSecondsField';
import { RunHistoryLimitField } from '@/components/comfy/RunHistoryLimitField';
import {
  ChatTabsFirstSwitch,
  LanguageSelect,
  SETTING_HEADING_CLASS,
  ThemeSelect,
} from '@/components/ui/appearance-fields';
import { DiagnosticsFields } from '@/components/ui/diagnostics-fields';
import { SafeguardFields } from '@/components/ui/safeguard-fields';
import { SettingSwitch } from '@/components/ui/setting-switch';
import { ComfyRemoteAgreementRow, TermsFields } from '@/components/ui/terms-dialog';
import { DEFAULT_LORA_COPY_FORMAT } from '@/graph/model-files';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function SettingsPanel(): React.ReactElement {
  const loraCopyFormat = useSettingsStore((state) => state.loraCopyFormat);
  const setLoraCopyFormat = useSettingsStore((state) => state.setLoraCopyFormat);
  const recordRunHistory = useSettingsStore((state) => state.recordRunHistory);
  const setRecordRunHistory = useSettingsStore((state) => state.setRecordRunHistory);
  const showPassedLines = useSettingsStore((state) => state.showPassedLines);
  const setShowPassedLines = useSettingsStore((state) => state.setShowPassedLines);
  const showControl = useSettingsStore((state) => state.showControlNodes);
  const setShowControl = useSettingsStore((state) => state.setShowControlNodes);
  const showUnlinked = useSettingsStore((state) => state.showUnlinkedNodes);
  const setShowUnlinked = useSettingsStore((state) => state.setShowUnlinkedNodes);
  const refreshHidden = useTabsStore((state) => state.refreshHiddenCandidates);

  const onLoraFormatKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!fillsPlaceholder(event)) return;
    event.preventDefault();
    setLoraCopyFormat(DEFAULT_LORA_COPY_FORMAT);
  };

  return (
    <div className="flex flex-col gap-2 text-2xs">
      <p className="text-foreground px-1">{t('comfy.bar.heading')}</p>

      <ConnectionBar />

      <label className={SETTING_HEADING_CLASS} htmlFor="lora-copy-format">
        {t('settings.loraFormat.label')}
      </label>
      <input
        id="lora-copy-format"
        className="border-input bg-background max-w-(--control-max) rounded-md border px-2 py-1
          font-mono text-xs"
        value={loraCopyFormat}
        placeholder={DEFAULT_LORA_COPY_FORMAT}
        spellCheck={false}
        onChange={(event) => setLoraCopyFormat(event.target.value)}
        onKeyDown={onLoraFormatKeyDown}
      />
      <p className="text-muted-foreground px-1">{t('settings.loraFormat.note')}</p>

      <LanguageSelect />

      <ThemeSelect />
      <ChatTabsFirstSwitch />

      <span className={SETTING_HEADING_CLASS}>{t('settings.nodeDisplay.heading')}</span>
      <SettingSwitch
        checked={showControl}
        onChange={(shown) => {
          refreshHidden();
          setShowControl(shown);
        }}
        label={t('flow.toggles.controlLabel')}
        spaced={false}
      />
      <SettingSwitch
        checked={showUnlinked}
        onChange={(shown) => {
          refreshHidden();
          setShowUnlinked(shown);
        }}
        label={t('flow.toggles.unlinkedLabel')}
        spaced={false}
      />
      <SettingSwitch
        checked={showPassedLines}
        onChange={setShowPassedLines}
        label={t('settings.passedLines.label')}
        spaced={false}
      />
      <p className="text-muted-foreground px-1">{t('settings.passedLines.note')}</p>

      <label className={SETTING_HEADING_CLASS} htmlFor="slideshow-seconds">
        {t('settings.slideshow.label')}
      </label>
      <SlideshowSecondsField
        id="slideshow-seconds"
        className="border-input bg-background w-12 rounded-md border px-2 py-1 text-xs
          tabular-nums"
      />
      <p className="text-muted-foreground px-1">{t('settings.slideshow.note')}</p>

      <span className={SETTING_HEADING_CLASS}>{t('settings.runHistory.heading')}</span>
      <SettingSwitch
        checked={recordRunHistory}
        onChange={setRecordRunHistory}
        label={t('settings.runHistory.label')}
        spaced={false}
      />
      <p className="text-muted-foreground px-1">{t('settings.runHistory.note')}</p>
      <label className={SETTING_HEADING_CLASS} htmlFor="run-history-limit">
        {t('settings.runHistory.limitLabel')}
      </label>
      <RunHistoryLimitField id="run-history-limit" />
      <p className="text-muted-foreground px-1">{t('settings.runHistory.limitNote')}</p>

      <SafeguardFields />

      <DiagnosticsFields area="comfy" />

      <TermsFields>
        <ComfyRemoteAgreementRow />
      </TermsFields>
    </div>
  );
}

function fillsPlaceholder(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  return (
    event.key === 'Tab' &&
    !event.shiftKey &&
    !event.nativeEvent.isComposing &&
    event.currentTarget.value.length === 0
  );
}
