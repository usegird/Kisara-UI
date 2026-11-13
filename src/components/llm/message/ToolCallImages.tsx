import { imageRunId } from '@/chat/tool-results';
import type { ToolCallRecord } from '@/chat/types';
import {
  imagesOf,
  runView,
  type ShownRun,
  type ShownRuns,
} from '@/components/llm/message/tool-call-runs';
import { CallImages } from '@/components/llm/message/ToolCallResult';
import { openChatImage } from '@/components/llm/workspace/chat-viewer';
import type { OutputFileRef } from '@/port/files';

// ─────────────────────────────
// ワークフローの呼び出しの画像の欄。
// ─────────────────────────────

/** 呼び出しの画像の欄の props */
export interface ToolCallImagesProps {
  readonly chatId: string;
  readonly messageId: string;
  readonly calls: readonly ToolCallRecord[];
  readonly shown: ShownRuns;
  readonly onShow: (callId: string, shown: ShownRun) => void;
}

/**
 * 呼び出しごとに、表示している実行の画像を中央に縦に並べる。実行し直している間は表示を変えず、
 * 受け取った画像を読み終えてから新しい実行の画像に切り替える。出せる実行が 2 回以上なら切り替えを
 * 画像の下に出す
 */
export function ToolCallImages({
  chatId,
  messageId,
  calls,
  shown,
  onShow,
}: ToolCallImagesProps): React.ReactElement | null {
  const views = calls.flatMap((call) => {
    const view = runView(call, shown);
    const visible = imagesOf(view.runs[view.held ?? view.index]).length > 0;
    return view.count < 2 && !visible ? [] : [{ call, view }];
  });
  if (views.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-2">
      {views.map(({ call, view }) => {
        const onCallShow = (next: ShownRun): void => onShow(call.id, next);
        const onCallOpen = (run: number, file: OutputFileRef): void =>
          openChatImage(chatId, imageRunId(messageId, call.id, run), file);
        return <CallImages key={call.id} view={view} onShow={onCallShow} onOpen={onCallOpen} />;
      })}
    </div>
  );
}
