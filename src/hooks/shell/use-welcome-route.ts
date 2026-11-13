import { useSyncExternalStore } from 'react';

// ─────────────────────────────
// はじめの画面のアドレス。`#` から後ろは配信元へ送られないので、配信の側の設定は要らない。
// ─────────────────────────────

/** はじめの画面のアドレス。左上の名前はこのアドレスへのリンク */
export const WELCOME_HREF = '#welcome';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** アドレスがはじめの画面を指しているか */
export function useWelcomeRoute(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash === WELCOME_HREF,
    () => false,
  );
}

/** アドレスから `#welcome` を外して、はじめの画面を閉じる（履歴は足さない） */
export function leaveWelcome(): void {
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', pathname + search);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
