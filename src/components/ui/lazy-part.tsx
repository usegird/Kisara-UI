import { createElement, lazy, Suspense, useState, type ComponentType, type ReactNode } from 'react';

import { PartLoadFault } from '@/components/ui/part-loading';
import { t, type MessageKey } from '@/i18n';
import { asError } from '@/lib/fault';

const loaders = new Set<() => Promise<unknown>>();

export function preloadLazyParts(): void {
  for (const load of loaders) void load().catch(() => undefined);
}

export function lazyPart<P extends object>(
  label: MessageKey,
  load: () => Promise<ComponentType<P>>,
  fallback: (props: P) => ReactNode,
): ComponentType<P> {
  let loading: Promise<ComponentType<P>> | null = null;
  let loaded: ComponentType<P> | null = null;
  const loadOnce = (): Promise<ComponentType<P>> => {
    loading ??= load().then(
      (component) => {
        loaded = component;
        return component;
      },
      (error: unknown) => {
        loading = null;
        throw error;
      },
    );
    return loading;
  };
  loaders.add(loadOnce);

  const Lazy = lazy<ComponentType<P>>(() =>
    loadOnce().then(
      (component) => ({ default: component }),
      (error: unknown) => {
        const Fault: ComponentType<P> = () => (
          <PartLoadFault label={t(label)} error={asError(error)} />
        );
        return { default: Fault };
      },
    ),
  );

  return function LazyPart(props: P): React.ReactElement {
    const [direct] = useState(() => loaded);
    if (direct !== null) return createElement(direct, props);
    return <Suspense fallback={fallback(props)}>{createElement(Lazy, props)}</Suspense>;
  };
}
