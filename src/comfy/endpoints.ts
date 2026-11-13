import { developerMessage } from '@/comfy/request-error';
import { parseHttpBaseUrl } from '@/lib/web-url';
import type { ComfyFailure, ComfyFailureParams } from '@/port/connection';

// ─────────────────────────────
// ComfyUI のエンドポイント URL 組み立ての唯一の入口。設計書の表にあるものだけを定義し、
// ここに無い URL を各所で組み立てない。
// ─────────────────────────────

type BaseUrlReason = Extract<
  ComfyFailure['reasonCode'],
  'base-url-empty' | 'base-url-scheme' | 'base-url-invalid'
>;

/**
 * 接続先の URL が空・読めない・http(s) でない。文は画面の側が理由の符号から引く
 */
export class InvalidBaseUrlError extends Error implements ComfyFailure {
  readonly reasonCode: BaseUrlReason;
  readonly params: ComfyFailureParams;

  constructor(reasonCode: BaseUrlReason, baseUrl: string, options?: ErrorOptions) {
    const params = reasonCode === 'base-url-empty' ? {} : { url: baseUrl };
    super(developerMessage(reasonCode, params), options);
    this.name = 'InvalidBaseUrlError';
    this.reasonCode = reasonCode;
    this.params = params;
  }
}

/**
 * 末尾スラッシュを落として正規化する。
 * **パス接頭辞は保持する**（リバースプロキシ配下の `https://example.com/comfy` のような
 * 配置と、開発時の Vite プロキシ `/comfy` に対応するため）。
 */
export function normalizeBaseUrl(baseUrl: string): string {
  const parsed = parseHttpBaseUrl(baseUrl);
  if (parsed.kind === 'ok') return parsed.url;
  if (parsed.kind === 'invalid') {
    throw new InvalidBaseUrlError('base-url-invalid', baseUrl, { cause: parsed.cause });
  }
  throw new InvalidBaseUrlError(
    parsed.kind === 'empty' ? 'base-url-empty' : 'base-url-scheme',
    baseUrl,
  );
}

function path(baseUrl: string, ...segments: string[]): string {
  const encoded = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `${normalizeBaseUrl(baseUrl)}/${encoded}`;
}

/**
 * サーバー機能フラグ。応答が軽いので**疎通確認はこれを使う**。
 * `/object_info` は 20 MB 近くあり接続テストには重すぎる。
 */
export function featuresUrl(baseUrl: string): string {
  return path(baseUrl, 'features');
}

/**
 * ノード定義一覧（20 MB 近く。取得後は射影して生データを捨てる）
 */
export function objectInfoUrl(baseUrl: string): string {
  return path(baseUrl, 'object_info');
}

/**
 * 版と実行環境。診断ファイルのダイアログを開いたときだけ読む。
 * 応答には起動オプション（`argv`）も入るが、読むのは決めた欄だけ（`parseSystemStats`）
 */
export function systemStatsUrl(baseUrl: string): string {
  return path(baseUrl, 'system_stats');
}

/**
 * 特定ノードのスキーマ（数 KB。COMBO 選択肢の遅延取得に使う）
 */
export function objectInfoClassUrl(baseUrl: string, className: string): string {
  return path(baseUrl, 'object_info', className);
}

/** ワークフロー実行。GPU を消費するため呼び出しは事前確認が要る */
export function promptUrl(baseUrl: string): string {
  return path(baseUrl, 'prompt');
}

/**
 * 実行の中断。これだけでは止まり切らないので、キューからの削除（POST /queue）と併用する
 */
export function interruptUrl(baseUrl: string): string {
  return path(baseUrl, 'interrupt');
}

/** `/view` で取るファイルの指定 */
interface ViewParams {
  readonly filename: string;
  /** 'input' | 'output' | 'temp'。既定は output */
  readonly type?: string;
  readonly subfolder?: string;
}

/**
 * 入力画像のアップロード（multipart）。接続先の入力フォルダへ書く
 */
export function uploadImageUrl(baseUrl: string): string {
  return path(baseUrl, 'upload', 'image');
}

/** 実行結果ファイル・入力画像の取得 */
export function viewUrl(baseUrl: string, params: ViewParams): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/view`);
  url.searchParams.set('filename', params.filename);
  if (params.type !== undefined) url.searchParams.set('type', params.type);
  if (params.subfolder !== undefined) url.searchParams.set('subfolder', params.subfolder);
  return url.toString();
}

/**
 * ユーザーフォルダの `dir` の下のファイルの一覧（保存済みワークフローなど）。
 * `full_info=true` で `{path, size, modified, created}` が返る。
 */
export function userdataListUrl(baseUrl: string, dir: string): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/userdata`);
  url.searchParams.set('dir', dir);
  url.searchParams.set('recurse', 'true');
  url.searchParams.set('split', 'false');
  url.searchParams.set('full_info', 'true');
  return url.toString();
}

/**
 * ユーザーフォルダのファイルの取得。
 * id は根からの相対経路を**1つの値として**エンコードする（途中の `/` も含めて）。
 * **`%` だけは 2 回符号化する。** 接続先は aiohttp がほどいた後、`%` が残っていればもう一度ほどく。
 * 1 回だけだと `50%20a.json` が `50 a.json` として読み書きされる。
 * `%` を含まない名前は 1 回の符号化のままなので、接続先の作りに左右されない。
 */
export function userdataItemUrl(baseUrl: string, path: string): string {
  const id = encodeURIComponent(path.replaceAll('%', '%25'));
  return `${normalizeBaseUrl(baseUrl)}/userdata/${id}`;
}

/**
 * ユーザーフォルダへの書き込み。**上書きするかを必ず渡す**（接続先は指定が無いと上書きする）。
 * `false` なら、既にあるときはサーバーが 409 を返す。
 */
export function userdataWriteUrl(baseUrl: string, path: string, overwrite: boolean): string {
  return `${userdataItemUrl(baseUrl, path)}?overwrite=${String(overwrite)}`;
}

/** 保存済みワークフロー。`workflows/<path>` を 1 つの値として扱う */
export function userdataFileUrl(baseUrl: string, dir: string, path: string): string {
  return userdataItemUrl(baseUrl, `${dir}/${path}`);
}

/** キューの読み取りと、実行前のタスクの取り消し（`POST /queue`） */
export function queueUrl(baseUrl: string): string {
  return path(baseUrl, 'queue');
}

/**
 * 実行の履歴の一覧。
 * `max_items` を付けると新しいものから件数を絞れる（全件返させない）。`offset` も付けると、古い方から
 * その件数を飛ばした所から `max_items` 件（分けて全件を読むとき）
 */
export function historyUrl(
  baseUrl: string,
  options: { maxItems?: number | undefined; offset?: number | undefined } = {},
): string {
  const url = path(baseUrl, 'history');
  if (options.maxItems === undefined) return url;
  const offset = options.offset === undefined ? '' : `&offset=${String(options.offset)}`;
  return `${url}?max_items=${String(options.maxItems)}${offset}`;
}

/** 実行 1 件の履歴。知らない id には接続先が空のオブジェクトを返す */
export function historyItemUrl(baseUrl: string, promptId: string): string {
  return path(baseUrl, 'history', promptId);
}

// ─────────────────────────────
// 同梱のワークフローテンプレート。本体が静的に配る読み取り専用の経路。
// ─────────────────────────────

/** 一覧。言語を渡すと訳した一覧（`index.ja.json`）。無い言語は接続先が 404 を返す */
export function templateIndexUrl(baseUrl: string, locale?: string): string {
  return path(baseUrl, 'templates', locale === undefined ? 'index.json' : `index.${locale}.json`);
}

/** 本体（`{name}.json`）とサムネイル（`{name}-1.webp`）。ファイル名を 1 つの値として渡す */
export function templateFileUrl(baseUrl: string, file: string): string {
  return path(baseUrl, 'templates', file);
}

/**
 * ノードの利用頻度の表（ノード名 → 回数、多い順）。frontend に同梱の静的ファイルで、
 * 本体のノード検索の Most relevant が使う。版によっては無い
 */
export function nodeFrequencyUrl(baseUrl: string): string {
  return path(baseUrl, 'assets', 'sorted-custom-node-map.json');
}

/**
 * 実行状況・進捗の WebSocket。http(s) を ws(s) に読み替える。
 * **パス接頭辞は残す**（`https://example.com/comfy` → `wss://example.com/comfy/ws`）。
 * 上書きすると、リバースプロキシ配下と開発時のプロキシで繋がらない。
 */
export function websocketUrl(baseUrl: string, clientId: string): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('clientId', clientId);
  return url.toString();
}

// ─────────────────────────────
// モデルの一覧とプレビュー画像・拡張の経路。
// 本体の `app/model_manager.py` にある経路で、`server.py` の一覧には出てこない。
// 持たない版の接続先では 404 になるので、呼び出し側は無い前提の道を残す。
// ─────────────────────────────

/**
 * ワイルドカードの名前の一覧。**本体ではなく Impact Pack の経路**で、
 * 入っていない接続先では 404 になる
 */
export function wildcardListUrl(baseUrl: string): string {
  return path(baseUrl, 'impact', 'wildcards', 'list');
}

/** 種別（`loras` など）ごとのファイル一覧 */
export function modelListUrl(baseUrl: string, folder: string): string {
  return path(baseUrl, 'experiment', 'models', folder);
}

/** モデルのプレビュー画像の指定。一覧の 1 件から作る */
interface ModelPreviewParams {
  readonly folder: string;
  /** 種別が持つ経路の何番目か（一覧の `pathIndex`） */
  readonly pathIndex: number;
  /** 種別の根からの相対経路。区切りは残したまま渡す */
  readonly name: string;
}

/**
 * プレビュー画像。末尾は `{filename:.*}` で受けるので**区切りは残す**。
 * 各要素だけを符号化し、`/` は素通しする。
 */
export function modelPreviewUrl(baseUrl: string, params: ModelPreviewParams): string {
  const name = params.name
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const prefix = path(baseUrl, 'experiment', 'models', 'preview', params.folder);

  return `${prefix}/${String(params.pathIndex)}/${name}`;
}

/**
 * safetensors に埋め込まれた metadata（`__metadata__`）。
 * 持たない・safetensors でない・metadata が無いときは接続先が 404 を返す。
 */
export function modelMetadataUrl(baseUrl: string, folder: string, filename: string): string {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}/view_metadata/${encodeURIComponent(folder)}`);
  url.searchParams.set('filename', filename);
  return url.toString();
}

/**
 * モデルと同名の `.txt`（メモ）。**ComfyUI-Custom-Scripts（pysssss）の経路**で、読むだけに使う。
 * 種別の中のファイルをそのまま返す。無い・拡張が無いときは 404。
 * 種別と名前を `/` も含めて 1 つの要素として符号化する（拡張の画面と同じ渡し方）。
 */
export function modelNotesUrl(baseUrl: string, folder: string, filename: string): string {
  const stem = filename.replace(/\.[^./\\]*$/, '');
  return path(baseUrl, 'pysssss', 'view', `${folder}/${stem}.txt`);
}

/**
 * ComfyUI-Custom-Scripts（pysssss）の有無を確かめる経路（Lora の名前の一覧を返す）。
 * メモの経路は「無い」と「拡張が無い」が同じ 404 になるので、有無はこちらで見る。
 */
export function modelNotesProbeUrl(baseUrl: string): string {
  return path(baseUrl, 'pysssss', 'loras');
}

/**
 * タグ補完の一覧。**ComfyUI-Custom-Scripts（pysssss）の経路**で、拡張の中のファイルをそのまま返す。
 * 無い・拡張が無いときは 404。同じ経路の `POST` は上書きするので使わない
 */
export function pysssssTagsUrl(baseUrl: string): string {
  return path(baseUrl, 'pysssss', 'autocomplete');
}
