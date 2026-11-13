import { Menu } from '@base-ui/react/menu';
import { Menu as MenuIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { FlowCanvas } from '@/components/comfy/flow/FlowCanvas';
import { BrokenNotice, ErrorBoundary } from '@/components/ui/error-boundary';
import { openDemoFile, openDemoSample, resetDemoView } from '@/demo/demo-data';
import { DemoIntro } from '@/demo/DemoIntro';
import { SimulatedRunPane } from '@/demo/SimulatedRunPane';
import { useNarrowScreen } from '@/hooks/ui/use-narrow-screen';
import { t } from '@/i18n';
import { messageOf } from '@/lib/fault';
import { useGraphStore } from '@/store/use-graph-store';

// ─────────────────────────────
// 公開用のデモの画面。見出しの帯とワークフローの画面だけを置き、タブ・実行・保存・接続は持たない。
// ─────────────────────────────

const HEADER_BUTTON = 'border-input hover:bg-muted rounded border px-2 py-0.5 text-xs';

const MENU_ITEM =
  'data-highlighted:bg-accent data-highlighted:text-accent-foreground flex cursor-default ' +
  'items-center rounded px-2 py-1.5 text-sm outline-none select-none';

interface DemoMenuProps {
  readonly onOpenFile: () => void;
  readonly onResetSample: () => void;
}

/** 狭い画面の見出しの帯の右端のメニュー。説明の一行と操作を畳む */
function DemoMenu({ onOpenFile, onResetSample }: DemoMenuProps): React.ReactElement {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="hover:bg-muted text-muted-foreground ml-auto rounded p-1"
        aria-label={t('demo.menu')}
        title={t('demo.menu')}
      >
        <MenuIcon className="size-4" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50 outline-none" side="bottom" align="end" sideOffset={4}>
          <Menu.Popup
            className="bg-popover text-popover-foreground w-72 max-w-[calc(100vw-2rem)] rounded-md
              border p-1 shadow-md outline-none"
          >
            <p className="text-muted-foreground px-2 pt-1 pb-2 text-xs">{t('demo.tagline')}</p>
            <Menu.Item className={MENU_ITEM} onClick={onOpenFile}>
              {t('demo.openFile')}
            </Menu.Item>
            <Menu.Item className={MENU_ITEM} onClick={onResetSample}>
              {t('demo.resetSample')}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** デモの頁。見出しの帯・案内の帯・ワークフローの画面・模擬実行の枠を描く */
export function FlowStyleDemo(): React.ReactElement {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // 開き直すたびに模擬実行の枠を作り直す（実行を止め、結果を消す）
  const [opened, setOpened] = useState(0);
  const workflow = useGraphStore((state) => state.workflow);
  const narrow = useNarrowScreen();

  const openFilePicker = (): void => fileInput.current?.click();
  const openSample = (): void => {
    setFileError(null);
    resetDemoView();
    openDemoSample();
    setOpened((count) => count + 1);
  };

  const openFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFileError(null);
    try {
      await openDemoFile(file);
      setOpened((count) => count + 1);
    } catch (error) {
      setFileError(messageOf(error));
    }
  };

  return (
    <div className="bg-background text-foreground flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 px-4 py-2">
        <h1 className="font-semibold">FlowStyleDemo</h1>
        {narrow ? (
          <DemoMenu onOpenFile={openFilePicker} onResetSample={openSample} />
        ) : (
          <>
            <p className="text-muted-foreground mr-2 text-xs">{t('demo.tagline')}</p>
            <button type="button" className={HEADER_BUTTON} onClick={openFilePicker}>
              {t('demo.openFile')}
            </button>
            <button type="button" className={HEADER_BUTTON} onClick={openSample}>
              {t('demo.resetSample')}
            </button>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,.png,application/json,image/png"
          className="hidden"
          onChange={(event) => {
            void openFile(event.target.files?.[0]);
            // 同じファイルをもう一度選んでも開けるように
            event.target.value = '';
          }}
        />
      </header>
      <DemoIntro withTagline={narrow} />
      {fileError === null ? null : (
        <p role="alert" className="text-destructive px-4 pb-2 text-xs">
          {t('demo.openFailed', { error: fileError })}
        </p>
      )}
      <main className="relative min-h-0 flex-1">
        {/* 描けなければ見本に戻す手を出す。開き直したら作り直す */}
        <ErrorBoundary
          label={t('demo.workflow')}
          resetKey={workflow}
          fallback={(error, retry) => (
            <div className="p-4">
              <BrokenNotice label={t('demo.workflow')} error={error} onRetry={retry} />
            </div>
          )}
        >
          <FlowCanvas
            insertBar={false}
            nodeSettings={false}
            cardTools={false}
            appImport={false}
            appScrollbarLeft={false}
            commentBelow
            chipOutputs
            offscreenLines={false}
            appRemove={false}
            clickScroll={false}
            dragPan={false}
            roomy
          />
        </ErrorBoundary>
        <SimulatedRunPane key={opened} />
      </main>
    </div>
  );
}
