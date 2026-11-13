// ─────────────────────────────
// ファイルの参照の型。実行の出力と、置いた入力画像。実体は持たない。
// ─────────────────────────────

/** `executed` イベントが返す出力ファイルの参照（実体は取りに行かない） */
export interface OutputFileRef {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

/**
 * `/upload/image` の応答。置いた名前とサブフォルダ
 */
export interface UploadedImage {
  readonly name: string;
  readonly subfolder: string;
  readonly type: string;
}

/** 結果画像の中身と、そのファイルの更新時刻（epoch ミリ秒。接続先が知らせなければ null） */
export interface OutputImageBody {
  readonly blob: Blob;
  readonly modifiedAt: number | null;
}
