import { cva } from 'class-variance-authority';

import { t } from '@/i18n';
import {
  connectionStatusView,
  type ConnectionStatusView,
  type ConnectionTone,
} from '@/queue/connection-status';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 接続ステータス。接続の状況とノード定義の取得の状況を、点の色と短い文で出す。
// ─────────────────────────────

// 色の分岐は cva の variants 1 か所に寄せる
const dot = cva('size-2 shrink-0 rounded-full', {
  variants: {
    tone: {
      off: 'bg-muted-foreground/40',
      busy: 'bg-slot-conditioning motion-safe:animate-pulse',
      ok: 'bg-slot-image',
      warn: 'bg-slot-conditioning',
      error: 'bg-destructive',
    } satisfies Record<ConnectionTone, string>,
  },
  defaultVariants: { tone: 'off' },
});

interface ConnectionSummary {
  readonly view: ConnectionStatusView;
  /** 指したときに出す詳しい中身（接続先・補足・ノード定義） */
  readonly title: string;
  readonly definitions: string;
}

function useConnectionSummary(): ConnectionSummary {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const status = useConnectionStore((state) => state.status);
  const socketStatus = useConnectionStore((state) => state.socketStatus);
  const socketRetry = useConnectionStore((state) => state.socketRetry);
  const socketTimeout = useConnectionStore((state) => state.socketTimeout);

  const definitionsStatus = useDefinitionsStore((state) => state.status);
  const definitionCount = useDefinitionsStore((state) => state.definitions.size);
  const definitionsSource = useDefinitionsStore((state) => state.source);

  const view = connectionStatusView(status, socketStatus, socketRetry, socketTimeout ?? undefined);
  const definitions =
    definitionsStatus === 'ready'
      ? t(
          definitionsSource === 'cache'
            ? 'comfy.status.definitionsCached'
            : 'comfy.status.definitionsFetched',
          { count: definitionCount },
        )
      : t(
          definitionsStatus === 'loading'
            ? 'comfy.status.definitionsLoading'
            : 'comfy.status.definitionsMissing',
        );
  const title = [
    baseUrl.length > 0 ? baseUrl : t('comfy.status.noTarget'),
    view.label,
    view.detail,
    definitions,
  ]
    .filter((line): line is string => line !== null && line.length > 0)
    .join('\n');

  return { view, title, definitions };
}

/** 接続ステータスの受け取り物 */
export interface ConnectionStatusProps {
  /** 狭い列に置くとき。補足とノード定義は説明（ホバー）へ寄せる */
  readonly compact?: boolean | undefined;
}

/** 接続の状況の点と文。指すと接続先と詳しい状況を出す */
export function ConnectionStatus({ compact = false }: ConnectionStatusProps): React.ReactElement {
  const { view, title, definitions } = useConnectionSummary();

  return (
    <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs" title={title}>
      <span aria-hidden className={dot({ tone: view.tone })} />
      <span className="truncate">{view.label}</span>
      {compact || view.detail === null ? null : (
        <span className="hidden sm:inline">
          {t('comfy.status.detail', { detail: view.detail })}
        </span>
      )}
      {compact ? null : <span className="hidden md:inline">/ {definitions}</span>}
    </span>
  );
}
