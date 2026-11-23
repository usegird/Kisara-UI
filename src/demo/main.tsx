import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createHttpPort } from '@/comfy/http-port';
import { installDemoDefinitions, openDemoSample, resetDemoView } from '@/demo/demo-data';
import { FlowStyleDemo } from '@/demo/FlowStyleDemo';
import { initLocale } from '@/i18n';
import { safeStorage } from '@/lib/safe-storage';
import { installTheme } from '@/store/install/install-theme';
import { installComfyPortWithoutConsent } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';

import '@/styles/globals.css';

const DEMO_SETTINGS_KEY = 'flowstyle-demo.settings';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

installComfyPortWithoutConsent(createHttpPort());
installTheme();

function isFirstVisit(): boolean {
  return safeStorage().getItem(DEMO_SETTINGS_KEY) === null;
}

async function start(root: HTMLElement): Promise<void> {
  const firstVisit = isFirstVisit();
  await initLocale('en');
  useSettingsStore.persist.setOptions({ name: DEMO_SETTINGS_KEY });
  await useSettingsStore.persist.rehydrate();
  useSettingsStore.setState({ baseUrl: '', theme: 'system' });
  if (firstVisit) resetDemoView();

  installDemoDefinitions();
  openDemoSample();

  createRoot(root).render(
    <StrictMode>
      <FlowStyleDemo />
    </StrictMode>,
  );
}

void start(container);
