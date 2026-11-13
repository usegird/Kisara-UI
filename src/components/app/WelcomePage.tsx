import { useEffect, useRef, useState } from 'react';

import { RouteFigure } from '@/components/app/RouteFigure';
import { DialogFrame } from '@/components/ui/dialog';
import { AGREEMENT_LINK } from '@/components/ui/document-body';
import type { LandingKind } from '@/components/ui/landing-kind';
import { TermsConsent } from '@/components/ui/terms-dialog';
import { leaveWelcome } from '@/hooks/shell/use-welcome-route';
import { t, tParts } from '@/i18n';

import logoUrl from './kisara-logo.svg';
import backgroundUrl from './welcome-background.svg';

// ─────────────────────────────
// はじめの画面。利用規約にまだ同意していない間は外枠の代わりに、同意した後は `#welcome` で外枠の上に重ねて出す
// （出し分けは呼び出し側が持つ）。
// ─────────────────────────────

/** 本文の段。見出しと、一文か名前付きの項目の並び */
const SECTIONS = [
  { key: 'about', heading: 'app.welcome.aboutHeading', body: 'app.welcome.about' },
  {
    key: 'uses',
    heading: 'app.welcome.usesHeading',
    items: [
      ['app.welcome.useChatName', 'app.welcome.useChat'],
      ['app.welcome.useImageName', 'app.welcome.useImage'],
    ],
  },
  {
    key: 'features',
    heading: 'app.welcome.featuresHeading',
    items: [
      ['app.welcome.featureBrowserName', 'app.welcome.featureBrowser'],
      ['app.welcome.featurePrivacyName', 'app.welcome.featurePrivacy'],
      ['app.welcome.featureCraftName', 'app.welcome.featureCraft'],
    ],
  },
] as const;

/** はじめの画面に種別の層が渡すもの */
export interface WelcomePageProps {
  /** 「システム構成」の図に経路を出す種別の札を組む手続き。並べた順に経路を出す */
  readonly landings: readonly (() => LandingKind)[];
}

/** はじめの画面の頁。ロゴと名前の帯・本文の段・同意の段を描く */
export function WelcomePage({ landings }: WelcomePageProps): React.ReactElement {
  const title = useRef<HTMLHeadingElement>(null);
  // リンクから開くと、押したリンクは裏の画面に隠れるので、焦点を見出しへ移す
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    // 紺の地では補助の文字の既定の色が読みにくいので、この頁の中だけ明るい色に替える
    <div
      className="bg-logo-bottom text-foreground relative isolate h-full overflow-y-auto
        [--muted-foreground:var(--logo-muted-foreground)]"
    >
      {/* ダークでは絵の明るい線が文字に重なっても 4.5:1 を保てるよう、絵を薄める */}
      <img
        src={backgroundUrl}
        alt=""
        className="pointer-events-none fixed right-0 bottom-0 -z-10 w-[min(1100px,100vw)] dark:opacity-60"
      />
      {/*
        帯は押せる物を持たないので、下を通る本文を押せるよう押す操作を通す。
        上へ 5px はみ出すのは、ロゴの上の透明な余白を隠すため
      */}
      <div
        className="from-logo-top pointer-events-none roomy:sticky roomy:-top-[5px] roomy:z-10 -mt-[5px]
          flex items-start gap-1 bg-linear-to-b from-50% to-transparent to-50% px-6 py-1"
      >
        <img src={logoUrl} alt="" className="h-32 w-auto shrink-0 sm:h-48" />
        <div className="flex h-16 items-end sm:h-24 sm:pb-0.5">
          <h1
            ref={title}
            id="welcome-title"
            tabIndex={-1}
            className="text-logo-bottom text-3xl font-light outline-none sm:text-4xl"
          >
            {t('app.welcome.title')}
          </h1>
        </div>
      </div>
      {/* 1240px 以上ではロゴと横に重ならないので、本文を帯の下端より上へ引き上げる */}
      <main
        className="mx-auto flex max-w-2xl flex-col gap-8 px-6 pt-5 pb-10 text-sm
          min-[1240px]:-mt-[15px] min-[1240px]:pt-0"
      >
        {SECTIONS.map((section) => (
          <section
            key={section.key}
            aria-labelledby={`welcome-${section.key}`}
            className="flex flex-col gap-2"
          >
            <h2 id={`welcome-${section.key}`} className="text-base font-semibold">
              {t(section.heading)}
            </h2>
            {'body' in section ? <p className="pl-4">{t(section.body)}</p> : null}
            {'items' in section ? (
              <dl className="flex flex-col gap-2">
                {section.items.map(([name, detail]) => (
                  <div key={name}>
                    <dt className="mt-[3px] font-medium">{t(name)}</dt>
                    <dd className="text-muted-foreground pl-4">
                      {t(detail)}
                      {detail === 'app.welcome.featurePrivacy' ? (
                        <SystemLink landings={landings} />
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ))}
        <section
          aria-label={t('app.landing.consentHeading')}
          className="border-border bg-muted/40 rounded-md border px-[15px] py-[11px]"
        >
          <TermsConsent onStart={leaveWelcome} />
        </section>
      </main>
    </div>
  );
}

/**
 * 「システム構成」のリンクと、接続の経路の図のダイアログ。括弧は文言の側が持つので、リンクにするのは名前だけ
 */
function SystemLink({ landings }: WelcomePageProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const routes = landings.flatMap((landing) => landing().routes);
  return (
    <>
      <span className="block text-xs">
        {tParts('app.welcome.systemLink').map((part, index) =>
          index % 2 === 0 ? (
            part
          ) : (
            <button
              key={part}
              type="button"
              className={AGREEMENT_LINK}
              onClick={() => setOpen(true)}
            >
              {t('app.welcome.system')}
            </button>
          ),
        )}
      </span>
      <DialogFrame
        id="welcome-system"
        open={open}
        onOpenChange={setOpen}
        size="smWide"
        embeddable={false}
        scheme="light"
        title={t('app.welcome.system')}
      >
        {/* 図は白地なので、ダイアログはライトの組で描き、本体を図の地で埋める */}
        <div className="bg-figure-bg max-h-[80vh] min-h-0 flex-1 overflow-y-auto text-sm">
          <RouteFigure routes={routes} sketch />
        </div>
      </DialogFrame>
    </>
  );
}
