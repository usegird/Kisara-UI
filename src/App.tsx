import { AppShell } from '@/components/app/AppShell';
import { RootFallback } from '@/components/app/RootFallback';
import { WelcomePage } from '@/components/app/WelcomePage';
import { comfyLanding } from '@/components/comfy/landing';
import { comfyShell } from '@/components/comfy/shell-parts';
import { llmLanding } from '@/components/llm/landing';
import { chatShell } from '@/components/llm/shell-parts';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useWelcomeRoute } from '@/hooks/shell/use-welcome-route';
import { t } from '@/i18n';
import { isAccepted, useTermsStore } from '@/store/use-terms-store';

/** はじめの画面の「システム構成」に出す種別の経路。会話を先に出す */
const LANDINGS = [llmLanding, comfyLanding];

/**
 * アプリの根。最後の受け止め口で包み、同意の有無で外枠とはじめの画面を出し分ける。
 * 外枠とはじめの画面は種別を知らないので、種別の層の部品をここで渡す（両方を知ってよいのは根だけ）。
 * 同意するまでは外枠を組まない（起動時の自動接続は外枠を組んだときに 1 回走る）。
 * はじめの画面は外枠の上に重ねる（タブの中身を落とさない）。同意の前後で同じ位置に置き、
 * 同意したときに組み直さない（焦点と送った位置を保つ）
 */
export function App(): React.ReactElement {
  const accepted = useTermsStore((state) => isAccepted(state.accepted));
  const welcome = useWelcomeRoute();
  const showWelcome = !accepted || welcome;
  return (
    <ErrorBoundary
      label={t('app.boundary')}
      fallback={(error, retry) => <RootFallback error={error} onRetry={retry} />}
    >
      {accepted ? (
        <div className="h-full" inert={showWelcome}>
          <AppShell workflow={comfyShell} chat={chatShell} />
        </div>
      ) : null}
      {showWelcome ? (
        <div className="fixed inset-0 z-50">
          <WelcomePage landings={LANDINGS} />
        </div>
      ) : null}
    </ErrorBoundary>
  );
}
