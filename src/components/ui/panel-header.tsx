import { DialogCloseButton, DialogHeader } from '@/components/ui/dialog-header';
import { t } from '@/i18n';

// ─────────────────────────────
// 焦点を閉じ込めない枠（`DialogWindow`）の、題名だけの見出しの帯。
// 送りや番号を持つもの（詳細・ビューワー）は `DialogHeader` を直に使う。
// ─────────────────────────────

/** 題名だけの見出しの帯の props */
export interface PanelHeaderProps {
  /** 題名。無ければ補足から始める（中身の名前だけで足りるもの） */
  readonly title?: React.ReactNode | undefined;
  /** 題名の右に小さく出す補足 */
  readonly subtitle?: React.ReactNode | undefined;
  /** 右寄せ、出し方の切り替えの左に置くもの */
  readonly actions?: React.ReactNode | undefined;
  readonly onClose: () => void;
  /** 閉じる × の読み上げの名前。既定は「閉じる」 */
  readonly closeLabel?: string | undefined;
  /** 閉じる × を指したときの説明。既定は読み上げの名前と同じ */
  readonly closeTitle?: string | undefined;
}

/** 題名・補足・右寄せの操作・閉じる × を並べた見出しの帯 */
export function PanelHeader({
  title,
  subtitle,
  actions,
  onClose,
  closeLabel = t('common.close'),
  closeTitle = closeLabel,
}: PanelHeaderProps): React.ReactElement {
  return (
    <DialogHeader
      heading={
        title === undefined ? undefined : (
          <h2 className="shrink-0 text-sm font-semibold">{title}</h2>
        )
      }
      subtitle={subtitle}
      actions={actions}
      close={<DialogCloseButton onClose={onClose} label={closeLabel} title={closeTitle} />}
    />
  );
}
