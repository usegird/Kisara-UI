import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Component } from 'react';

import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import { t } from '@/i18n';
import { asError } from '@/lib/fault';
import { traceFault } from '@/lib/trace';
import { useFaultStore } from '@/store/use-fault-store';

// ─────────────────────────────
// 描けなかった部品だけを差し替える受け止め口。外から来た値が想定外の形でも、
// **壊れた部品の外へは広げない**。
// ─────────────────────────────

/** 受け止め口の props */
export interface ErrorBoundaryProps {
  /** どの部品か。帯とログに出す（例: 「ノード 3（KSampler）」） */
  readonly label: string;
  readonly children: React.ReactNode;
  /** 差し替える見た目。無ければ既定の小さな枠 */
  readonly fallback?: ((error: Error, retry: () => void) => React.ReactNode) | undefined;
  /** これが変わったら作り直す（ワークフローを切り替えたときなど） */
  readonly resetKey?: unknown;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  readonly resetKey: unknown;
}

/**
 * 受け止め口。React の受け止め口はクラスでしか書けない（関数コンポーネントの API が無い）。
 * 捕まえた失敗は画面上部の帯にも残す（どこで何が起きたかを追えるように）
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: asError(error) };
  }

  // 作り直す鍵が変わったら、壊れた印を外してもう一度描く
  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (Object.is(props.resetKey, state.resetKey)) return null;
    return { error: null, resetKey: props.resetKey };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const caught = asError(error);
    console.error(`[${this.props.label}]`, caught);
    // 診断のログには描けなかった部品の位置も残す
    traceFault(this.props.label, caught, info.componentStack);
    useFaultStore.getState().report(this.props.label, caught.message);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  override render(): React.ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return this.props.fallback ? (
      this.props.fallback(error, this.retry)
    ) : (
      <BrokenNotice label={this.props.label} error={error} onRetry={this.retry} />
    );
  }
}

/** 既定の差し替えの props */
export interface BrokenNoticeProps {
  /** 何が描けなかったか */
  readonly label: string;
  readonly error: Error;
  /** もう一度描く */
  readonly onRetry: () => void;
  /** 「もう一度描く」の横に並べる操作 */
  readonly extra?: React.ReactNode;
}

/** 既定の差し替え。何が描けなかったかと理由、もう一度描く操作を出す */
export function BrokenNotice({
  label,
  error,
  onRetry,
  extra,
}: BrokenNoticeProps): React.ReactElement {
  return (
    <div
      role="alert"
      className="border-destructive/50 bg-destructive/5 text-foreground flex flex-col gap-1.5
        rounded border p-2 text-xs"
    >
      <p className="flex items-center gap-1.5 font-medium">
        <TriangleAlert className="text-destructive size-3.5 shrink-0" aria-hidden />
        {t('ui.boundary.cannotShow', { label })}
      </p>
      <p className="text-muted-foreground break-all">{error.message}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={FALLBACK_BUTTON_CLASS} onClick={onRetry}>
          <RotateCcw className="size-3" aria-hidden />
          {t('ui.boundary.retry')}
        </button>
        {extra}
      </div>
    </div>
  );
}
