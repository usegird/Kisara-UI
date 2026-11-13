import { useState } from 'react';

import { SETTING_HEADING_CLASS } from '@/components/ui/appearance-fields';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SettingSwitch } from '@/components/ui/setting-switch';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';
import { useStorageDialogStore } from '@/store/use-storage-dialog-store';

// ─────────────────────────────
// 会話の右の列の設定のタブの、ブラウザデータの管理の欄。
// ─────────────────────────────

const BUTTON = 'hover:bg-muted rounded-md border px-2 py-1 text-xs disabled:opacity-40';
const HINT = 'text-muted-foreground px-1 text-2xs';

/** ストレージの管理を開くボタンと、ComfyUI に控えを書くかのスイッチ（入れるときだけ確かめる） */
export function ComfyBackupField(): React.ReactElement {
  const backup = useSettingsStore((state) => state.chatComfyBackup);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className={SETTING_HEADING_CLASS}>{t('llm.backup.heading')}</span>
      <div className="px-1">
        <button
          type="button"
          className={BUTTON}
          onClick={() => useStorageDialogStore.getState().open()}
        >
          {t('llm.backup.manage')}
        </button>
      </div>
      <p className={HINT}>{t('llm.backup.hint')}</p>
      <SettingSwitch
        checked={backup}
        onChange={(next) => {
          if (next) setConfirming(true);
          else useSettingsStore.getState().setChatComfyBackup(false);
        }}
        label={t('llm.backup.toggle')}
        spaced={false}
      />
      <p className={HINT}>{t('llm.backup.toggleHint')}</p>
      <ConfirmDialog
        open={confirming}
        title={t('llm.backup.confirm.title')}
        description={t('llm.backup.confirm.description')}
        confirmLabel={t('llm.backup.confirm.enable')}
        onConfirm={() => {
          setConfirming(false);
          useSettingsStore.getState().setChatComfyBackup(true);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
