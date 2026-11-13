import { playbookRows } from '@/components/llm/playbook/use-playbook-manage';
import { CARD_BODY } from '@/components/llm/side-panel/extension-card';
import { t } from '@/i18n';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 機能のタブのプレイブックのカード。
// ─────────────────────────────

/** プレイブックを使うかと、選ぶ所に出す標準のプレイブックを決めるカード */
export function PlaybookSettingsCard(): React.ReactElement {
  const on = useSettingsStore((state) => state.playbooksOn);
  const hidden = useSettingsStore((state) => state.playbooksHidden);
  const rows = playbookRows({}).builtin;

  return (
    <section className="flex flex-col gap-2 rounded-md border p-2" aria-labelledby="playbooks">
      {/* 切っても 1 件ずつのチェックは残す。既に選んだ会話はそのまま使える */}
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => useSettingsStore.getState().setPlaybooksOn(event.target.checked)}
        />
        <span id="playbooks">{t('llm.extension.playbook.title')}</span>
      </label>
      <div className={CARD_BODY}>
        <p className="text-muted-foreground text-2xs">{t('llm.extension.playbook.hint')}</p>
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.key} className="flex items-start gap-1.5">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={!hidden.includes(row.key)}
                aria-label={t('llm.extension.playbook.show', { name: row.name })}
                onChange={(event) =>
                  useSettingsStore.getState().setPlaybookShown(row.key, event.target.checked)
                }
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs font-medium">{row.name}</span>
                <span className="text-muted-foreground text-2xs">{row.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
