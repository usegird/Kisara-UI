import type { LlmKeyPort } from '@/port/llm-port';
import { useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

// ─────────────────────────────
// ゲートウェイの窓口の受け口。入口が実装を入れ、キーのある接続先をストアに写す。キーが入ったら確かめて結果を返す。
// ─────────────────────────────

/** ゲートウェイの無いとき（テスト・デモ）。キーは無く、入力の窓も開けない */
const NO_GATEWAY: LlmKeyPort = {
  keyedUrls: () => [],
  subscribe: () => () => undefined,
  openEntry: () => 'unready',
  onKeySet: () => () => undefined,
  reportVerified: () => undefined,
  forgetKey: () => undefined,
};

let current: LlmKeyPort = NO_GATEWAY;

/** 入口から呼ぶ。キーのある接続先が変わるたびにストアへ写し、キーが入るたびに確かめる */
export function installLlmKeyPort(port: LlmKeyPort): void {
  current = port;
  const copy = (): void => {
    useLlmKeysStore.setState({ keyed: port.keyedUrls() });
    // 読み込み直した直後は、ゲートウェイがキーを戻すより先に自動でつなぐ番が来る
    useLlmProfilesStore.getState().resumeKeyed();
  };
  port.subscribe(copy);
  port.onKeySet((baseUrl) => {
    void useLlmProfilesStore
      .getState()
      .verifyKey(baseUrl)
      .then((outcome) => port.reportVerified(baseUrl, outcome));
  });
  copy();
}

/** 入っているゲートウェイの窓口。入っていなければキーの無い窓口 */
export function llmKeyPort(): LlmKeyPort {
  return current;
}
