import { t } from '@/i18n';
import type { ConnectionFailureCode } from '@/port/connection';

// ─────────────────────────────
// 接続失敗の案内文。原因の推定は `diagnoseFailure` が返すコードだけで、文言はここが持つ
// （取得・計算と表示を分ける）。どのコードでも「次にやること」が1つに決まるように書く。
// ─────────────────────────────

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
/** これ以上はサーバーの側の失敗 */
const HTTP_SERVER_ERROR = 500;

/** 接続失敗の案内。見出しの一文と、上から試す手順 */
export interface FailureGuide {
  readonly summary: string;
  /** 上から順に試す手順 */
  readonly steps: readonly string[];
}

/** 起動オプションの値。ページのオリジンが取れなければ `*` */
function corsFlag(origin: string): string {
  return `--enable-cors-header ${origin.length > 0 ? origin : '*'}`;
}

/** 起動オプションを足した、ComfyUI の起動コマンドの見本 */
interface LaunchSample {
  /** 見本の見出し。打ち込む場所（シェル）を示す */
  readonly label: string;
  /** ComfyUI を起動するコマンドに、起動オプションを足した形 */
  readonly command: string;
}

/** 起動の見本。シェルで `main.py` を直接起動する形に揃える */
export function launchSample(origin: string): LaunchSample {
  return { label: 'shell', command: `python main.py ${corsFlag(origin)}` };
}

/** 応答が無いときの案内。接続先が分かれば文に入れる */
function downGuide(target: string | undefined): FailureGuide {
  return {
    summary:
      target !== undefined && target.length > 0
        ? t('connection.guide.summary.downTarget', { target })
        : t('connection.guide.summary.down'),
    steps: [t('connection.guide.steps.checkTarget')],
  };
}

/** HTTP エラーの案内。ステータスで次にやることが変わる */
function httpErrorGuide(status: number | undefined, flag: string): FailureGuide {
  const summary =
    status === undefined
      ? t('connection.guide.summary.httpError')
      : t('connection.guide.summary.httpStatus', { status: String(status) });

  if (status === HTTP_FORBIDDEN) {
    return {
      summary,
      steps: [
        t('connection.guide.steps.addCorsFlag', { flag }),
        t('connection.guide.steps.allowThroughProxy'),
      ],
    };
  }
  if (status === HTTP_NOT_FOUND) {
    return {
      summary,
      steps: [
        t('connection.guide.steps.checkUrlIsComfy'),
        t('connection.guide.steps.includePathPrefix'),
        t('connection.guide.steps.updateForFeatures'),
      ],
    };
  }
  if (status !== undefined && status >= HTTP_SERVER_ERROR) {
    return {
      summary,
      steps: [t('connection.guide.steps.checkConsole'), t('connection.guide.steps.waitAndRetry')],
    };
  }
  return {
    summary,
    steps: [t('connection.guide.steps.checkProxy'), t('connection.guide.steps.checkConsole')],
  };
}

/**
 * 接続の失敗のコードから、見出しと次にやる手順を組み立てる。
 * @param target - 接続先の URL。応答が無いときの文に入れる
 */
export function failureGuide(
  code: ConnectionFailureCode,
  origin: string,
  status?: number,
  target?: string,
): FailureGuide {
  const flag = corsFlag(origin);

  switch (code) {
    case 'cors':
      return {
        summary: t('connection.guide.summary.cors'),
        steps: [
          t('connection.guide.steps.addCorsFlag', { flag }),
          t('connection.guide.steps.restartFully'),
        ],
      };
    case 'down':
      return downGuide(target);
    case 'http-error':
      return httpErrorGuide(status, flag);
    case 'cors-or-down':
      return {
        summary: t('connection.guide.summary.corsOrDown'),
        steps: [
          t('connection.guide.steps.checkRunning'),
          t('connection.guide.steps.addCorsFlag', { flag }),
          t('connection.guide.steps.checkUrlAndPort'),
        ],
      };
    case 'local-network':
      return {
        summary: t('connection.guide.summary.localNetwork'),
        steps: [
          t('connection.guide.steps.allowPrompt'),
          t('connection.guide.steps.allowFromSiteIcon'),
          t('connection.guide.steps.openOnSameMachine'),
        ],
      };
    case 'mixed-content':
      return {
        summary: t('connection.guide.summary.mixedContent'),
        steps: [
          t('connection.guide.steps.reopenWithHttp'),
          t('connection.guide.steps.publishHttps'),
        ],
      };
    case 'timeout':
      return {
        summary: t('connection.guide.summary.timeout'),
        steps: [
          t('connection.guide.steps.waitForModels'),
          t('connection.guide.steps.checkHeavyWork'),
          t('connection.guide.steps.checkPortService'),
        ],
      };
    case 'bad-response':
      return {
        summary: t('connection.guide.summary.badResponse'),
        steps: [
          t('connection.guide.steps.checkUrlIsComfy'),
          t('connection.guide.steps.includePathPrefix'),
        ],
      };
    case 'offline':
      return {
        summary: t('connection.guide.summary.offline'),
        steps: [t('connection.guide.steps.reconnectNetwork')],
      };
    default:
      return {
        summary: t('connection.guide.summary.unknown'),
        steps: [
          t('connection.guide.steps.checkUrlAndRetry'),
          t('connection.guide.steps.checkConsole'),
        ],
      };
  }
}

/**
 * 実行が HTTP 403 で弾かれたときの案内。
 * ComfyUI は `--enable-cors-header` を付けずに起動していると、
 * **Origin が Host と食い違う変更系リクエスト（POST など）を 403 で拒否する**。
 * 読み取り（GET）は通るので、「繋がっているのに実行だけ失敗する」形で出る。
 */
export function forbiddenRunGuide(origin: string): FailureGuide {
  return {
    summary: t('connection.guide.summary.forbiddenRun'),
    steps: [
      t('connection.guide.steps.restartWithCors', { origin: origin.length > 0 ? origin : '*' }),
      t('connection.guide.steps.writesOnlyRejected'),
    ],
  };
}
