import type * as Client from '@/comfy/client';
import { ComfyRequestError } from '@/comfy/request-error';

export { ComfyRequestError, type FetchLike, type RequestOptions } from '@/comfy/request-error';

function offline(url: string): Promise<never> {
  return Promise.reject(
    new ComfyRequestError('unreachable', url, { message: 'The demo does not connect.' }),
  );
}

export const fetchJson: typeof Client.fetchJson = (url) => offline(url);
export const postJson: typeof Client.postJson = (url) => offline(url);
export const fetchBytes: typeof Client.fetchBytes = (url) => offline(url);

export const fetchBytesStamped: typeof Client.fetchBytesStamped = (url) => offline(url);
export const fetchText: typeof Client.fetchText = (url) => offline(url);
export const postText: typeof Client.postText = (url) => offline(url);
export const postForm: typeof Client.postForm = (url) => offline(url);
export const postBlob: typeof Client.postBlob = (url) => offline(url);
export const deleteRequest: typeof Client.deleteRequest = (url) => offline(url);
