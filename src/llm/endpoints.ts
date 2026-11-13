import { parseHttpBaseUrl } from '@/lib/web-url';

// ─────────────────────────────
// LLM のエンドポイント URL の組み立ての唯一の入口。Chat Completions とモデルの一覧と、
// llama.cpp の設定の読み取り（`/props`）と、OpenRouter の API キーの確かめ（`/key`）だけ。
// ─────────────────────────────

/**
 * 末尾のスラッシュを落とす。スキームが無ければ `http://` を足す。http(s) 以外・組み立てられない
 * ものは null。**パスは残す**（多くのサーバーは `/v1` で終わる）
 */
export function normalizeLlmBaseUrl(baseUrl: string): string | null {
  const parsed = parseHttpBaseUrl(baseUrl);
  return parsed.kind === 'ok' ? parsed.url : null;
}

/** `POST /chat/completions` の URL */
export function chatCompletionsUrl(base: string): string {
  return `${base}/chat/completions`;
}

/** モデルの一覧（`GET /models`）の URL */
export function modelsUrl(base: string): string {
  return `${base}/models`;
}

/** OpenRouter の今の API キーの情報（キーが通るかを確かめる） */
export function keyUrl(base: string): string {
  return `${base}/key`;
}

/** llama.cpp の設定（`/props`）。OpenAI 互換の経路（`/v1`）の外、サーバーの根に置かれる */
export function propsUrl(base: string): string {
  return `${base.replace(/\/v1$/, '')}/props`;
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

/**
 * 保護された経路のページから、保護されない手元以外の宛先へ送るか（ブラウザが止める）。
 * 手元（ループバック）は保護されない経路でも通る
 */
export function isMixedContent(target: string, pageProtocol: string | null): boolean {
  if (pageProtocol !== 'https:') return false;
  const url = new URL(target);
  return url.protocol === 'http:' && !LOOPBACK.test(url.hostname);
}
