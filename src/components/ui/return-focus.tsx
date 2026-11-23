import { useEffect, useRef, useState } from 'react';

function currentFocus(): HTMLElement | null {
  const active = globalThis.document.activeElement;
  return active instanceof HTMLElement && active !== globalThis.document.body ? active : null;
}

export function ReturnFocus({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [opener] = useState(currentFocus);

  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const restore = (): void => {
        if (mounted.current || opener?.isConnected !== true) return;
        if (currentFocus() !== opener) opener.focus();
      };
      globalThis.setTimeout(restore);
      globalThis.requestAnimationFrame(() => globalThis.setTimeout(restore));
    };
  }, [opener]);

  return <>{children}</>;
}
