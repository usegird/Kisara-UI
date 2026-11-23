export interface OutputFileRef {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

export interface OutputText {
  readonly nodeId: string;
  readonly texts: readonly string[];
}

export interface UploadedImage {
  readonly name: string;
  readonly subfolder: string;
  readonly type: string;
}

export interface OutputImageBody {
  readonly blob: Blob;
  readonly modifiedAt: number | null;
}
