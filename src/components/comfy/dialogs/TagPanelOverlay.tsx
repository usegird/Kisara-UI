import { INSERT_SOURCE_MARK } from '@/components/comfy/dialogs/insert-target';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';
import { TAG_PANEL_DIALOG, useTagsStore } from '@/store/use-tags-store';

// ─────────────────────────────
// タグ辞書の画面の枠。初めの読み込みを軽くするため、中身（`TagPanel`）は開いたときに読む。
// 枠は先に出し、差し込みの出どころの印もここに付ける。
// ─────────────────────────────

const TagPanel = lazyPart<Record<never, never>>(
  'tags.title',
  () => import('@/components/comfy/dialogs/TagPanel').then((m) => m.TagPanel),
  () => <PartLoading label={t('tags.title')} />,
);

/** タグ辞書の画面を開いているときだけ、埋め込みで開く枠を出す */
export function TagPanelOverlay(): React.ReactElement | null {
  const open = useTagsStore((state) => state.panelOpen);
  // 枠の × とほかの埋め込みへの切り替えは、直しかけを画面に確かめさせる
  const requestClose = useTagsStore((state) => state.requestClosePanel);
  if (!open) return null;

  return (
    <DialogWindow
      id={TAG_PANEL_DIALOG}
      label={t('tags.title')}
      defaultMode="embedded"
      marks={{ [INSERT_SOURCE_MARK]: '' }}
      onClose={requestClose}
    >
      <TagPanel />
    </DialogWindow>
  );
}
