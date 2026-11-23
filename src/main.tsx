import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/App';
import { createHttpPort } from '@/comfy/http-port';
import { preloadLazyParts } from '@/components/ui/lazy-part';
import { RenderProbe } from '@/components/ui/render-probe';
import { activeLocale, initLocale } from '@/i18n';
import { installTrustedTypes } from '@/lib/trusted-types';
import { createBrowserEmbeddingPort } from '@/llm/browser-embedding';
import { createGatewayHost } from '@/llm/gateway-host';
import { GATEWAY_ORIGIN } from '@/llm/gateway-origins';
import { createHttpLlmPort } from '@/llm/http-port';
import { installTheme } from '@/store/install/install-theme';
import { installTrace } from '@/store/install/install-trace';
import { startBackupCleanupCheck } from '@/store/persist/backup-cleanup';
import { startChatPersist } from '@/store/persist/chat-persist';
import { restoreChats } from '@/store/persist/chat-restore';
import { startLibraryBackup } from '@/store/persist/library-backup';
import { startSessionPersist } from '@/store/persist/session';
import { restoreSession } from '@/store/persist/session-restore';
import { installComfyPort } from '@/store/ports/comfy-port';
import { installEmbeddingPort } from '@/store/ports/embedding-port';
import { installLlmKeyPort } from '@/store/ports/llm-key-port';
import { installLlmPort } from '@/store/ports/llm-port';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { installFaultHandlers } from '@/store/use-fault-store';
import { usePlaybooksStore } from '@/store/use-playbooks-store';
import { usePresetsStore } from '@/store/use-presets-store';
import { useSemanticStore } from '@/store/use-semantic-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useSystemPromptsStore } from '@/store/use-system-prompts-store';

import '@/styles/globals.css';

const PRELOAD_IDLE_TIMEOUT_MS = 5_000;
const PRELOAD_FALLBACK_DELAY_MS = 2_000;

installTrustedTypes();

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

installFaultHandlers();
installTrace();
installTheme();
installComfyPort(createHttpPort());
const gateway = createGatewayHost({
  gatewayOrigin: GATEWAY_ORIGIN,
  direct: createHttpLlmPort(),
  document,
  open: (url, target, features) => globalThis.open(url, target, features),
  locale: activeLocale,
});
installLlmPort(gateway.llm);
installLlmKeyPort(gateway.keys);
installEmbeddingPort(createBrowserEmbeddingPort());

async function restoreDefinitions(): Promise<void> {
  const { baseUrl } = useSettingsStore.getState();
  if (baseUrl.length === 0) return;
  await useDefinitionsStore.getState().loadCached(baseUrl);
}

async function start(root: HTMLElement): Promise<void> {
  const presetsLoaded = usePresetsStore.getState().load();
  await Promise.all([
    initLocale(),
    restoreSession()
      .catch((error: unknown) => console.error('[控えの読み戻し]', error))
      .then(() => presetsLoaded)
      .then(() => restoreChats())
      .catch((error: unknown) => console.error('[会話の読み戻し]', error)),
    restoreDefinitions().catch((error: unknown) => console.error('[定義の読み戻し]', error)),
    presetsLoaded,
    useSystemPromptsStore.getState().load(),
    usePlaybooksStore.getState().load(),
  ]);
  if (useSettingsStore.getState().loreSemantic) void useSemanticStore.getState().load();
  startSessionPersist();
  startChatPersist();
  startLibraryBackup();
  startBackupCleanupCheck();

  if (import.meta.env.DEV || import.meta.env.MODE === 'profiling') {
    const profiling = import.meta.env.MODE === 'profiling';
    const { installPerfStats } = await import('@/store/install/install-perf-stats');
    installPerfStats(profiling);

    const { PerfStatsBar } = await import('@/components/app/PerfStatsBar');
    const bar = document.createElement('div');
    document.body.append(bar);
    createRoot(bar).render(<PerfStatsBar profiling={profiling} />);
  }
  if (import.meta.env.DEV) {
    const { installDevData } = await import('@/store/install/install-dev-data');
    installDevData();
    const { installStreamLog } = await import('@/llm/stream-log');
    installStreamLog();
  }

  createRoot(root).render(
    <StrictMode>
      <RenderProbe id="App">
        <App />
      </RenderProbe>
    </StrictMode>,
  );

  const idle: (callback: () => void) => void =
    typeof globalThis.requestIdleCallback === 'function'
      ? (callback) => globalThis.requestIdleCallback(callback, { timeout: PRELOAD_IDLE_TIMEOUT_MS })
      : (callback) => globalThis.setTimeout(callback, PRELOAD_FALLBACK_DELAY_MS);
  idle(preloadLazyParts);
}

void start(container);
