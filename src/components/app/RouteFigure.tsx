import { cva } from 'class-variance-authority';
import { AppWindow, ArrowDown, ArrowUpDown, Laptop, Server } from 'lucide-react';
import { useId } from 'react';

import type { LandingRoute } from '@/components/ui/landing-kind';
import { t } from '@/i18n';

// ─────────────────────────────
// 接続の経路の図。経路は種別の層が渡す（置き場とアイコンは経路が持つ）。
// `sketch` は手描き風（はじめの画面のシステム構成）。
// ─────────────────────────────

/** 揺らしの SVG フィルターの id。図が 2 つ出ても定義は同じなので 1 つに決める */
const SKETCH_FILTER = 'route-figure-sketch';

type Place = 'host' | 'cloud' | 'browser' | 'local';

/** 図の地。手描き風では方眼にする */
const figure = cva(
  'bg-figure-bg text-figure-ink flex flex-col items-stretch gap-1 rounded-md p-4',
  {
    variants: {
      sketch: {
        false: '',
        true: 'bg-[size:16px_16px] [background-image:var(--figure-paper)]',
      },
    },
  },
);

/** 経路の箱。上の段は高さを揃える。ブラウザの箱だけ塗る（手描き風では斜線で塗る） */
const box = cva('relative flex flex-col items-start gap-1 px-3 py-2 sm:flex-row sm:gap-2', {
  variants: {
    place: { host: 'flex-1', cloud: 'flex-1', local: '', browser: '' },
    sketch: {
      false: 'border-figure-line rounded-md border shadow-sm',
      true: '[border-radius:255px_12px_225px_12px/12px_225px_12px_255px]',
    },
  },
  compoundVariants: [
    { place: ['host', 'cloud', 'local'], class: 'bg-figure-box' },
    { place: 'browser', sketch: false, class: 'bg-figure-browser' },
    {
      place: 'browser',
      sketch: true,
      class: 'bg-figure-box [background-image:var(--figure-hatch)]',
    },
  ],
});

/**
 * 手描き風の線だけの層（揺らしを掛ける）。箱・枠の上に重ねる。
 * 揺らしを線だけの層に掛けるのは、文字を揺らさないため
 */
const sketchLine = cva(
  `pointer-events-none absolute inset-0 [filter:url(#route-figure-sketch)]
    [border-radius:255px_12px_225px_12px/12px_225px_12px_255px]`,
  {
    variants: {
      kind: {
        box: 'border-figure-ink border-2',
        device: 'border-figure-device-line border-2 border-dashed',
      },
    },
  },
);

/** ローカル端末の枠 */
const device = cva('relative flex flex-col gap-1 p-3', {
  variants: {
    sketch: {
      false: 'border-figure-device-line bg-figure-device rounded-md border-2 border-dashed',
      true: `border-2 border-transparent
        [border-radius:255px_12px_225px_12px/12px_225px_12px_255px]`,
    },
  },
});

/** 箱の頭の丸いアイコン。置き場ごとにロゴの色で塗る */
const badge = cva('grid size-7 shrink-0 place-items-center rounded-full text-white', {
  variants: {
    place: {
      host: 'bg-figure-host',
      cloud: 'bg-figure-cloud',
      browser: 'bg-figure-ink',
      local: 'bg-figure-local',
    },
  },
});

/** 手描き風のアイコン。丸を置かず、アイコンだけを置き場ごとの濃い色で描く */
const mark = cva('size-6 shrink-0', {
  variants: {
    place: {
      host: 'text-figure-host-ink',
      cloud: 'text-figure-cloud-ink',
      browser: 'text-figure-ink',
      local: 'text-figure-local-ink',
    },
  },
});

/**
 * 上にインターネットの側、下にローカル端末を置いた経路の図。
 * 狭い画面でも同じ段の箱は横に並べたまま（縦に積むと矢印が隣の箱を指す）
 */
export function RouteFigure({
  routes,
  sketch = false,
}: {
  /** 種別の層が渡す経路 */
  readonly routes: readonly LandingRoute[];
  /** 手描き風に描く（システム構成のダイアログ） */
  readonly sketch?: boolean;
}): React.ReactElement {
  const deviceId = useId();
  const cloud = routes.filter((route) => route.place === 'cloud');
  const local = routes.filter((route) => route.place === 'local');
  // 今開いているページのアドレス（`#` から後ろと問い合わせは出さない）
  const url = `${window.location.origin}${window.location.pathname}`;
  return (
    <figure className={figure({ sketch })}>
      {sketch ? <SketchFilter /> : null}
      {/* 上の段の箱をブラウザの箱の左右に揃えるため、ローカル端末の枠の線と余白の分だけ内へ寄せる */}
      <ul className="flex gap-3 border-x-2 border-transparent px-3 sm:gap-4">
        <li className="flex min-w-0 flex-1 flex-col gap-1">
          <RouteBox
            place="host"
            sketch={sketch}
            icon={Server}
            name={t('app.landing.hostName', { url })}
            detail={t('app.landing.hostDetail')}
          />
          <Connector via={t('app.landing.hostVia')} one />
        </li>
        {cloud.map((route) => (
          <li key={route.key} className="flex min-w-0 flex-1 flex-col gap-1">
            <RouteBox
              place="cloud"
              sketch={sketch}
              icon={route.icon}
              name={route.name}
              detail={route.detail}
            />
            <Connector via={route.via} />
          </li>
        ))}
      </ul>
      <div role="group" aria-labelledby={deviceId} className={device({ sketch })}>
        {sketch ? <span aria-hidden className={sketchLine({ kind: 'device' })} /> : null}
        <p id={deviceId} className="flex items-center gap-1.5 text-xs font-semibold">
          <Laptop aria-hidden className="size-4" />
          {t('app.landing.localDevice')}
        </p>
        <RouteBox
          place="browser"
          sketch={sketch}
          icon={AppWindow}
          name={t('app.landing.browserName')}
          detail={t('app.landing.browserDetail')}
        />
        <ul className="flex gap-3 sm:gap-4">
          {local.map((route) => (
            <li key={route.key} className="flex min-w-0 flex-1 flex-col gap-1">
              <Connector via={route.via} />
              <RouteBox
                place="local"
                sketch={sketch}
                icon={route.icon}
                name={route.name}
                detail={route.detail}
              />
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

/** 線を揺らすフィルター。雑音で少しずらし、手で引いた線に見せる */
function SketchFilter(): React.ReactElement {
  return (
    <svg aria-hidden className="absolute size-0">
      <filter id={SKETCH_FILTER}>
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="n"
          scale="3"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

function RouteBox({
  place,
  sketch,
  icon: Icon,
  name,
  detail,
}: {
  readonly place: Place;
  readonly sketch: boolean;
  readonly icon: LandingRoute['icon'];
  readonly name: string;
  readonly detail?: string | undefined;
}): React.ReactElement {
  return (
    <div className={box({ place, sketch })}>
      {sketch ? <span aria-hidden className={sketchLine({ kind: 'box' })} /> : null}
      {sketch ? (
        <Icon aria-hidden className={mark({ place })} />
      ) : (
        <span className={badge({ place })}>
          <Icon aria-hidden className="size-4" />
        </span>
      )}
      <div className="min-w-0 self-center">
        <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
        {detail === undefined ? null : <p className="text-figure-muted text-xs">{detail}</p>}
      </div>
    </div>
  );
}

/** 箱の間の矢印と、通り方の一言。`one` は一方向（配信元 → ブラウザ） */
function Connector({
  via,
  one = false,
}: {
  readonly via: string;
  readonly one?: boolean;
}): React.ReactElement {
  const Icon = one ? ArrowDown : ArrowUpDown;
  return (
    <div
      className="text-figure-muted flex items-center justify-center gap-1.5 py-1 text-center
        text-xs"
    >
      <Icon aria-hidden className="text-figure-arrow size-4 shrink-0" />
      <span>{via}</span>
    </div>
  );
}
