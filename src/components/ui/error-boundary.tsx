import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Component } from 'react';

import { FALLBACK_BUTTON_CLASS } from '@/components/ui/fallback-button';
import { t } from '@/i18n';
import { asError } from '@/lib/fault';
import { traceFault } from '@/lib/trace';
import { useFaultStore } from '@/store/use-fault-store';

export interface ErrorBoundaryProps {
  readonly label: string;
  readonly children: React.ReactNode;
  readonly fallback?: ((error: Error, retry: () => void) => React.ReactNode) | undefined;
  readonly resetKey?: unknown;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
  readonly resetKey: unknown;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: asError(error) };
  }

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

export interface BrokenNoticeProps {
  readonly label: string;
  readonly error: Error;
  readonly onRetry: () => void;
  readonly extra?: React.ReactNode;
}

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
