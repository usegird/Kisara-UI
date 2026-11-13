import type * as Client from '@/comfy/client';
import { ComfyRequestError } from '@/comfy/request-error';

export { ComfyRequestError, type FetchLike, type RequestOptions } from '@/comfy/request-error';

// ─────────────────────────────
// デモのビルドで `@/comfy/client` の代わりに入る。デモは通信しないので、
// 送る処理を持たず、呼ばれたら届かなかったとして断る
// ─────────────────────────────

function offline(url: string): Promise<never> {
  return Promise.reject(
    new ComfyRequestError('unreachable', url, { message: 'The demo does not connect.' }),
  );
}

/** 通信しない `fetchJson`。いつも届かなかったとして断る */
export const fetchJson: typeof Client.fetchJson = (url) => offline(url);
/** 通信しない `postJson`。いつも届かなかったとして断る */
export const postJson: typeof Client.postJson = (url) => offline(url);
/** 通信しない `fetchBytes`。いつも届かなかったとして断る */
export const fetchBytes: typeof Client.fetchBytes = (url) => offline(url);

/** 通信しない `fetchBytesStamped`。いつも届かなかったとして断る */
export const fetchBytesStamped: typeof Client.fetchBytesStamped = (url) => offline(url);
/** 通信しない `fetchText`。いつも届かなかったとして断る */
export const fetchText: typeof Client.fetchText = (url) => offline(url);
/** 通信しない `postText`。いつも届かなかったとして断る */
export const postText: typeof Client.postText = (url) => offline(url);
/** 通信しない `postForm`。いつも届かなかったとして断る */
export const postForm: typeof Client.postForm = (url) => offline(url);
/** 通信しない `postBlob`。いつも届かなかったとして断る */
export const postBlob: typeof Client.postBlob = (url) => offline(url);
/** 通信しない `deleteRequest`。いつも届かなかったとして断る */
export const deleteRequest: typeof Client.deleteRequest = (url) => offline(url);
