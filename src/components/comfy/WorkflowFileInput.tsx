import { FileUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { WorkflowIo } from '@/hooks/comfy/use-workflow-io';
import { t } from '@/i18n';

// ─────────────────────────────
// ワークフローを開くための隠しファイル入力と、画面へ落としたファイルの受け口。
// 開く操作の置き場はどれも閉じたり消えたりするので、常に描画される場所に置き、呼び出し元が参照から叩く。
// ─────────────────────────────

/** 隠しファイル入力と落とす先の props */
export interface WorkflowFileInputProps {
  /**
   * 選んだ・落としたファイルを開く。ふつうは `WorkflowIo.openFile`。外枠はその手前で
   * キャラクターカードを会話として開く
   */
  readonly openFile: WorkflowIo['openFile'];
  /** 隠しファイル入力を叩くための参照 */
  readonly fileInput: React.RefObject<HTMLInputElement | null>;
}

/**
 * ファイルを運んでいるドラッグか（文字や画面の中の部品のドラッグは受けない）。
 * 先に受けた所（文字の欄への差し込み）があればそちらに任せる
 */
function carriesFiles(event: DragEvent): boolean {
  return !event.defaultPrevented && (event.dataTransfer?.types.includes('Files') ?? false);
}

/**
 * 運んでいる間の表示を消すまでの間（ms）。`dragover` は運んでいる間ずっと続けて届くので、
 * 途切れたら画面の外へ出たとみなす（`dragleave` は中の要素をまたぐたびにも届き、当てにならない）
 */
const DRAG_IDLE_MS = 150;

/** 隠しファイル入力を置き、画面のどこへ落としたファイルも開く。運んでいる間は案内を重ねる */
export function WorkflowFileInput({
  openFile,
  fileInput,
}: WorkflowFileInputProps): React.ReactElement {
  const [carrying, setCarrying] = useState(false);

  // 落としたファイルを受けないと、ブラウザがそのファイルを開いて画面から離れてしまう
  useEffect(() => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const stop = (): void => {
      clearTimeout(idle);
      setCarrying(false);
    };
    const onDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      setCarrying(true);
      clearTimeout(idle);
      idle = setTimeout(stop, DRAG_IDLE_MS);
    };
    const onDrop = (event: DragEvent): void => {
      stop();
      if (!carriesFiles(event)) return;
      event.preventDefault();
      void openFile(event.dataTransfer?.files[0]);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      clearTimeout(idle);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, [openFile]);

  return (
    <>
      {carrying ? <DropHint /> : null}
      <input
        ref={fileInput}
        type="file"
        // JSON か、ComfyUI が書き出した PNG（埋め込みのワークフローを読む）
        accept="application/json,.json,image/png,.png"
        className="hidden"
        onChange={(event) => {
          void openFile(event.target.files?.[0]);
          // 同じファイルを続けて選んでも開けるように空へ戻す
          event.target.value = '';
        }}
      />
    </>
  );
}

/** 運んでいる間に重ねる案内。指の邪魔をしないよう、ポインタは受けない */
function DropHint(): React.ReactElement {
  return (
    <div
      className="bg-background/70 pointer-events-none fixed inset-0 z-50 p-4 backdrop-blur-[1px]"
      role="status"
    >
      <div
        className="border-primary/60 text-foreground flex h-full flex-col items-center justify-center
          gap-3 rounded-xl border-4 border-dashed"
      >
        <FileUp className="text-primary size-16" aria-hidden />
        <p className="text-lg font-medium">{t('comfy.fileInput.dropHint')}</p>
      </div>
    </div>
  );
}
