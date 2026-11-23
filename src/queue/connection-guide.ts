import { t } from '@/i18n';
import type { ConnectionFailureCode } from '@/port/connection';

const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVER_ERROR = 500;

export interface FailureGuide {
  readonly summary: string;
  readonly steps: readonly string[];
}

function corsFlag(origin: string): string {
  return `--enable-cors-header ${origin.length > 0 ? origin : '*'}`;
}

interface LaunchSample {
  readonly label: string;
  readonly command: string;
}

export function launchSample(origin: string): LaunchSample {
  return { label: 'shell', command: `python main.py ${corsFlag(origin)}` };
}

function downGuide(target: string | undefined): FailureGuide {
  return {
    summary:
      target !== undefined && target.length > 0
        ? t('connection.guide.summary.downTarget', { target })
        : t('connection.guide.summary.down'),
    steps: [t('connection.guide.steps.checkTarget')],
  };
}

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

export function forbiddenRunGuide(origin: string): FailureGuide {
  return {
    summary: t('connection.guide.summary.forbiddenRun'),
    steps: [
      t('connection.guide.steps.restartWithCors', { origin: origin.length > 0 ? origin : '*' }),
      t('connection.guide.steps.writesOnlyRejected'),
    ],
  };
}
