// ─────────────────────────────
// OpenRouter の見分け（キーの確認・Web 検索など、OpenRouter にだけある機能の有無）。
// つなぐ前の注意と関門の見分けは lib/remote-host（私的なアドレスの外かどうか）。
// ─────────────────────────────

/** 外部のクラウドのサービス（OpenRouter）のベース URL か。読めない URL は違うとみなす */
export function isCloudService(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl.trim()).hostname;
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}
