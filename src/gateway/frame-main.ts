import { safeStorage } from '@/lib/safe-storage';
import { installTrustedTypes } from '@/lib/trusted-types';
import { createLlmClient } from '@/llm/client';
import { serveGateway } from '@/llm/gateway-frame';
import { APP_ORIGIN, GATEWAY_ORIGIN } from '@/llm/gateway-origins';

// ─────────────────────────────
// ゲートウェイの iframe の起動。キーを付けて送る LLM の窓口を作り、本体と入力の窓の知らせを受け始める。
// ─────────────────────────────

installTrustedTypes();

serveGateway({
  appOrigin: APP_ORIGIN,
  gatewayOrigin: GATEWAY_ORIGIN,
  target: window,
  createClient: (keyOf) =>
    createLlmClient({
      fetch: (input, init) => globalThis.fetch(input, init),
      pageProtocol: () => globalThis.location.protocol,
      keyOf,
    }),
  storage: safeStorage('session'),
});
