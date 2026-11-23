import type { LlmKeyPort } from '@/port/llm-port';
import { useLlmKeysStore } from '@/store/use-llm-keys-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

const NO_GATEWAY: LlmKeyPort = {
  keyedUrls: () => [],
  subscribe: () => () => undefined,
  openEntry: () => 'unready',
  onKeySet: () => () => undefined,
  reportVerified: () => undefined,
  forgetKey: () => undefined,
};

let current: LlmKeyPort = NO_GATEWAY;

export function installLlmKeyPort(port: LlmKeyPort): void {
  current = port;
  const copy = (): void => {
    useLlmKeysStore.setState({ keyed: port.keyedUrls() });
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

export function llmKeyPort(): LlmKeyPort {
  return current;
}
