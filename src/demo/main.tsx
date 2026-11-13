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

// ─────────────────────────────
// 公開用のデモの入口。本体の入口（src/main.tsx）とは別のページで、
// 控えの読み戻し・接続・計測の台帳は持たない
// ─────────────────────────────

/** 設定の置き場。本体と同じ場所に置かれても、本体の接続先を読まず書き換えない */
const DEMO_SETTINGS_KEY = 'flowstyle-demo.settings';

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

// 通信の窓口。デモのビルドでは通信の入口が空の代わりに差し替わる。
// 通信しないので、利用規約の同意の関門を通さない
installComfyPortWithoutConsent(createHttpPort());
// 配色はブラウザ（OS）の設定に従う。描く前に付ける
installTheme();

/** デモの設定がまだ保存されていないか。読めない環境では初めてとみなす */
function isFirstVisit(): boolean {
  return safeStorage().getItem(DEMO_SETTINGS_KEY) === null;
}

async function start(root: HTMLElement): Promise<void> {
  const firstVisit = isFirstVisit();
  // デモは常に英語。見本の英語とボタンの言語を揃える
  await initLocale('en');
  // 本体の設定は読み込み時に載っているので、置き場を移してから接続先を空にする（通信の口を閉じる）。
  // 配色の切り替えは持たないので、本体から載った配色も OS に従うへ戻す
  useSettingsStore.persist.setOptions({ name: DEMO_SETTINGS_KEY });
  await useSettingsStore.persist.rehydrate();
  useSettingsStore.setState({ baseUrl: '', theme: 'system' });
  // 保存した幅が無ければ、本体から載った幅ではなくデモの既定にする
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
