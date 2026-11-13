// ─────────────────────────────
// 近似判定の埋め込みの窓口の型。モデルを読む・文を埋め込む・降ろす・置いたモデルを数えて消すだけを扱う。
// 実装は `llm/` が持ち、入口が受け口に入れる。値を持たない。
// ─────────────────────────────

/** 埋め込む文の種類。モデルによって問いと文書で別の接頭辞を求める */
export type EmbeddingKind = 'query' | 'passage';

/** 読むモデル（Hugging Face の ONNX）と、その使い方 */
export interface EmbeddingModel {
  /** `組織/名前` */
  readonly id: string;
  /** 固定する版。null なら最新 */
  readonly revision: string | null;
  /** 量子化の種類（`int8` は `model_int8.onnx`、`q8` は `model_quantized.onnx`） */
  readonly dtype: 'int8' | 'q8';
  /** 1 つのベクトルへのまとめ方（平均か先頭） */
  readonly pooling: 'mean' | 'cls';
  readonly queryPrefix: string;
  readonly passagePrefix: string;
  /** ありふれた発言（項目のふだんの近さを測る。問いとして埋め込む） */
  readonly generic: readonly string[];
}

/**
 * モデルを読んだ結果。読めたら、ありふれた発言のベクトルと、このブラウザに置いたモデルの大きさ。
 * 読めなければ理由の文（ライブラリの文をそのまま）
 */
export type EmbeddingLoad =
  | {
      readonly ok: true;
      readonly generic: readonly Float32Array[];
      /** このブラウザに置いたモデルのファイルの大きさの合計（バイト。分からなければ 0） */
      readonly bytes: number;
    }
  | { readonly ok: false; readonly message: string };

/** このブラウザに置いたモデル */
export interface StoredEmbeddingModel {
  /** `組織/名前` */
  readonly id: string;
  /** 置いたファイルの大きさの合計（バイト。分からなければ 0） */
  readonly bytes: number;
}

/** 近似判定の埋め込みの窓口。モデルの読み・埋め込み・降ろし・置いたモデルの管理 */
export interface EmbeddingPort {
  /**
   * モデルを読む（無ければ落とす）。ほかのモデルの落とした物は消さない。`onProgress` は 0〜1
   */
  readonly load: (
    model: EmbeddingModel,
    onProgress: (ratio: number) => void,
  ) => Promise<EmbeddingLoad>;
  /** 読んだモデルで文を埋め込む。長さ 1 にそろえたベクトルを同じ順で返す。失敗したら null */
  readonly embed: (
    texts: readonly string[],
    kind: EmbeddingKind,
  ) => Promise<readonly Float32Array[] | null>;
  /** 読んだモデルをメモリから降ろす。落とした物は残す */
  readonly unload: () => Promise<void>;
  /** このブラウザに置いたモデルの一覧（読めなければ空） */
  readonly stored: () => Promise<readonly StoredEmbeddingModel[]>;
  /** そのモデルの落とした物を消す */
  readonly remove: (id: string) => Promise<void>;
}
