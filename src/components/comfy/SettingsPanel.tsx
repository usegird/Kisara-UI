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

// ─────────────────────────────
// 設定のタブ。設定が増えるときはここに足し、画面の設定と接続の設定を散らさない。
// 操作の部品の幅の上限は、置き場所の側が `--control-max` で渡す。
// ─────────────────────────────

/** ComfyUI のタブの設定の欄を、設計書の段の順に並べる */
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
  // 切り替えたときにだけ、隠す相手を今の線で決め直す（カード列の脇の切り替えと同じ）
  const refreshHidden = useTabsStore((state) => state.refreshHiddenCandidates);

  return (
    <div className="flex flex-col gap-2 text-2xs">
      <p className="text-foreground px-1">{t('comfy.bar.heading')}</p>

      {/* 状況は接続の欄が併記するので、ここで二重に出さない。枠線では囲まない */}
      <ConnectionBar />

      {/* Lora のカード右上の写し取りに使う書式 */}
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
      />
      <p className="text-muted-foreground px-1">{t('settings.loraFormat.note')}</p>

      <LanguageSelect />

      <ThemeSelect />
      <ChatTabsFirstSwitch />

      {/* カードの列に出すノードと、受ける行がカードの列の上へ過ぎた変数の線も引くか */}
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

      {/* 画像ビューワーのスライドショーの送りの間隔 */}
      <label className={SETTING_HEADING_CLASS} htmlFor="slideshow-seconds">
        {t('settings.slideshow.label')}
      </label>
      <SlideshowSecondsField
        id="slideshow-seconds"
        className="border-input bg-background w-12 rounded-md border px-2 py-1 text-xs
          tabular-nums"
      />
      <p className="text-muted-foreground px-1">{t('settings.slideshow.note')}</p>

      {/* 実行の記録を接続先のユーザーフォルダに書くか */}
      <span className={SETTING_HEADING_CLASS}>{t('settings.runHistory.heading')}</span>
      <SettingSwitch
        checked={recordRunHistory}
        onChange={setRecordRunHistory}
        label={t('settings.runHistory.label')}
        spaced={false}
      />
      <p className="text-muted-foreground px-1">{t('settings.runHistory.note')}</p>
      {/* 1 セッションのファイルに残す実行の数 */}
      <label className={SETTING_HEADING_CLASS} htmlFor="run-history-limit">
        {t('settings.runHistory.limitLabel')}
      </label>
      <RunHistoryLimitField id="run-history-limit" />
      <p className="text-muted-foreground px-1">{t('settings.runHistory.limitNote')}</p>

      {/* 繰り返し実行と LLM の要求の量の上限。出すだけで変えられない */}
      <SafeguardFields />

      {/* ComfyUI の分野のログの段階と、ログのエクスポート */}
      <DiagnosticsFields area="comfy" />

      {/* 利用規約を見る・同意を取り消す */}
      <TermsFields>
        <ComfyRemoteAgreementRow />
      </TermsFields>
    </div>
  );
}
