import { t } from '@/i18n';

// ─────────────────────────────
// ノード定義をまだ持っていないときの案内。「解決できない」で終わらせず、次の手を示す。
// 定義が引けないノードは右の列のエラーのタブにノードごとに出すので、ここには出さない。
// ─────────────────────────────

/** 定義の無いときの案内の受け取り物 */
export interface MissingDefinitionsNoticeProps {
  /** 定義をまだ1件も持っていない（＝未接続） */
  readonly empty: boolean;
}

/** 定義を 1 件も持っていないときだけ、接続を促す一文を出す */
export function MissingDefinitionsNotice({
  empty,
}: MissingDefinitionsNoticeProps): React.ReactElement | null {
  if (!empty) return null;

  return (
    <p className="text-muted-foreground mx-auto mb-4 max-w-7xl text-xs">
      {t('flow.missingDefinitions')}
    </p>
  );
}
