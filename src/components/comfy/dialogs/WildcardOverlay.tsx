import { INSERT_SOURCE_MARK } from '@/components/comfy/dialogs/insert-target';
import { DialogWindow } from '@/components/ui/dialog-window';
import { lazyPart } from '@/components/ui/lazy-part';
import { PartLoading } from '@/components/ui/part-loading';
import { t } from '@/i18n';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// ワイルドカードの画面の枠。初めの読み込みを軽くするため、中身（`WildcardPanel`）は開いたときに読む。
// 枠は先に出し、差し込みの出どころの印もここに付ける。
// ─────────────────────────────

const WildcardPanel = lazyPart<Record<never, never>>(
  'wildcards.title',
  () => import('@/components/comfy/dialogs/WildcardPanel').then((m) => m.WildcardPanel),
  () => <PartLoading label={t('wildcards.title')} />,
);

/** ワイルドカードの画面を開いているときだけ、埋め込みで開く枠を出す */
export function WildcardOverlay(): React.ReactElement | null {
  const open = useWildcardsStore((state) => state.panelOpen);
  const close = useWildcardsStore((state) => state.closePanel);
  if (!open) return null;

  return (
    <DialogWindow
      id="wildcards"
      label={t('wildcards.title')}
      defaultMode="embedded"
      marks={{ [INSERT_SOURCE_MARK]: '' }}
      onClose={close}
    >
      <WildcardPanel />
    </DialogWindow>
  );
}
