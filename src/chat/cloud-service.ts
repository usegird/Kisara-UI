export function isCloudService(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl.trim()).hostname;
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}
