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

/** 開いたときだけ読む部品を先に読むのを、画面が空くまで待つ上限 */
const PRELOAD_IDLE_TIMEOUT_MS = 5_000;
/** 空くのを待てないブラウザで、先に読む前に置く間 */
const PRELOAD_FALLBACK_DELAY_MS = 2_000;

// 文字列を HTML・スクリプトの URL として差し込む操作を、決めた形だけに絞る
installTrustedTypes();

const container = document.getElementById('root');
if (!container) {
  throw new Error('#root not found');
}

// 誰も受けなかった失敗は帯で知らせる
installFaultHandlers();
// 診断のログの段階を設定から入れ、画面の出来事を見張る
installTrace();
// 配色は描く前に決める。読み戻しを待つ間の空の画面も同じ組で塗る
installTheme();
// 通信の窓口は HTTP の実装を使う。store と hooks より先に入れる
installComfyPort(createHttpPort());
// API キーは別のオリジンのゲートウェイが持つ。キーのある接続先への要求はゲートウェイへ回し、ほかは直に送る
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

/**
 * 残してあるノード定義を、今の接続先の分だけ戻す。通信はしない
 */
async function restoreDefinitions(): Promise<void> {
  const { baseUrl } = useSettingsStore.getState();
  if (baseUrl.length === 0) return;
  await useDefinitionsStore.getState().loadCached(baseUrl);
}

/**
 * 言語・開いていたタブ・ノード定義を**描く前に**戻してから描く。空の画面や
 * 「定義が無い」案内が一瞬出るのを避ける。置き場（IndexedDB）の読み出しは待ちが要るので、
 * 両方を並べて読み、読み終えてから描く
 */
async function start(root: HTMLElement): Promise<void> {
  // 控えが読めなくても起動は続ける（壊れた控えは空のタブとして始める。定義は接続で取れる）
  // 会話がリンクしているプリセットは、会話より先に読む
  const presetsLoaded = usePresetsStore.getState().load();
  await Promise.all([
    // 言語も描く前に決める。表が読めなければ英語で続く
    initLocale(),
    // 会話の中身は、並び（会話の id）を戻してから読む
    restoreSession()
      .catch((error: unknown) => console.error('[控えの読み戻し]', error))
      .then(() => presetsLoaded)
      .then(() => restoreChats())
      .catch((error: unknown) => console.error('[会話の読み戻し]', error)),
    restoreDefinitions().catch((error: unknown) => console.error('[定義の読み戻し]', error)),
    // 会話がリンクしているプリセットと、その前に追加辞書。読めなければ空の一覧で続く
    presetsLoaded,
    // システムプロンプトのテンプレート。読めなければ空の一覧で続く
    useSystemPromptsStore.getState().load(),
    // 自分のプレイブック。読めなければ空の一覧で続く
    usePlaybooksStore.getState().load(),
  ]);
  // 近似判定を有効にしてあれば、モデルを読み始める。モデルは画面の言語で選ぶので、言語を決めた後に
  // 読む（承認は有効にしたときに取った）
  if (useSettingsStore.getState().loreSemantic) void useSemanticStore.getState().load();
  startSessionPersist();
  startChatPersist();
  // プリセット・テンプレート・追加辞書の控え。読み込んだ後から追いかける
  startLibraryBackup();
  // ブラウザに元の無い古い控えを、つないだときに知らせる
  startBackupCleanupCheck();

  // 回数の台帳。開発と計測用ビルドだけ。通常の本番ビルドには入らない
  if (import.meta.env.DEV || import.meta.env.MODE === 'profiling') {
    // 時間と、表を開いた状態で始めるのは計測用ビルドだけ
    const profiling = import.meta.env.MODE === 'profiling';
    const { installPerfStats } = await import('@/store/install/install-perf-stats');
    installPerfStats(profiling);

    // 台帳を空にする・表で出すボタン。画面の計測の範囲に入らないよう、別の根に描く
    const { PerfStatsBar } = await import('@/components/app/PerfStatsBar');
    const bar = document.createElement('div');
    document.body.append(bar);
    createRoot(bar).render(<PerfStatsBar profiling={profiling} />);
  }
  // 接続せずに開発用のデータを開く入口。開発サーバだけ
  if (import.meta.env.DEV) {
    const { installDevData } = await import('@/store/install/install-dev-data');
    installDevData();
    // LLM から受け取った SSE の行を、注釈の行も含めて記録する（kisaraLlmLog）
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

  // 開いたときだけ読む部品を、画面が落ち着いてから先に読む。
  // 初期の JS には入れず、初めて開くときの待ちだけを消す。待てる仕組みが無いブラウザでは少し置いてから
  const idle: (callback: () => void) => void =
    typeof globalThis.requestIdleCallback === 'function'
      ? (callback) => globalThis.requestIdleCallback(callback, { timeout: PRELOAD_IDLE_TIMEOUT_MS })
      : (callback) => globalThis.setTimeout(callback, PRELOAD_FALLBACK_DELAY_MS);
  idle(preloadLazyParts);
}

void start(container);
