import { INSERT_SOURCE_MARK } from '@/components/comfy/dialogs/insert-target';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';
import { STYLE_EDITOR_DIALOG, useStylesStore } from '@/store/use-styles-store';

// ─────────────────────────────
// スタイルの編集の枠。初めの読み込みを軽くするため、中身（`StyleEditorPanel`）は開いたときに読む。
// 枠は先に出し、差し込みの出どころの印もここに付ける。
// ─────────────────────────────

const StyleEditorPanel = lazyPart<Record<never, never>>(
  'styles.edit',
  () => import('@/components/comfy/dialogs/StyleEditorPanel').then((m) => m.StyleEditorPanel),
  () => <PartLoading label={t('styles.edit')} />,
);

/** 編集中のスタイルがあるときだけ、埋め込みで開く枠を出す */
export function StyleEditorOverlay(): React.ReactElement | null {
  const editing = useStylesStore((state) => state.editing !== null);
  // ほかの埋め込みが開いたら、閉じるよう頼む（直しかけがあれば画面が確かめる）
  const requestClose = useStylesStore((state) => state.requestCloseEditor);
  if (!editing) return null;

  return (
    <DialogWindow
      id={STYLE_EDITOR_DIALOG}
      label={t('styles.title')}
      defaultMode="embedded"
      marks={{ [INSERT_SOURCE_MARK]: '' }}
      onClose={() => requestClose()}
    >
      <StyleEditorPanel />
    </DialogWindow>
  );
}
