import { LOCALE_KEY, resolveLocale, SOURCE_LOCALE } from '@/i18n/locales';
import { safeStorage } from '@/lib/safe-storage';
import {
  createAcceptance,
  isAccepted,
  isAgreementKey,
  loadAgreement,
  NOTICE_REVISION,
  parseAcceptance,
  PRIVACY_EFFECTIVE_DATE,
  saveAgreement,
  TERMS_EFFECTIVE_DATE,
  TERMS_REVISION,
} from '@/store/persist/agreements';
import { APP_PATH, moveTo, welcomePathOf } from '@/welcome/paths';

const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ConsentState {
  readonly accepted: boolean;
  readonly revised: boolean;
  readonly noticeSeen: boolean;
}

moveToChosenLanguage();
followColorScheme();
fillRuntimeParams();
wireDialogs();
wireConsent();

function moveToChosenLanguage(): void {
  if (document.documentElement.lang !== SOURCE_LOCALE) return;
  const saved = safeStorage().getItem(LOCALE_KEY);
  const code = resolveLocale(saved, globalThis.navigator?.languages ?? []);
  if (code !== SOURCE_LOCALE) moveTo(welcomePathOf(code), 'replace');
}

function followColorScheme(): void {
  const query = globalThis.matchMedia(DARK_QUERY);
  const apply = (): void => {
    document.documentElement.classList.toggle('dark', query.matches);
  };
  apply();
  query.addEventListener('change', apply);
}

function fillRuntimeParams(): void {
  const values: Readonly<Record<string, string>> = {
    pageUrl: `${globalThis.location.origin}${globalThis.location.pathname}`,
    termsRevision: String(TERMS_REVISION),
    termsDate: TERMS_EFFECTIVE_DATE,
    privacyDate: PRIVACY_EFFECTIVE_DATE,
  };
  for (const element of document.querySelectorAll<HTMLElement>('[data-param]')) {
    element.textContent = values[element.dataset.param ?? ''] ?? '';
  }
}

function wireDialogs(): void {
  for (const opener of document.querySelectorAll<HTMLElement>('[data-open]')) {
    opener.addEventListener('click', () => openDialog(opener.dataset.open ?? ''));
  }
  for (const closer of document.querySelectorAll<HTMLElement>('[data-close]')) {
    closer.addEventListener('click', () => closer.closest('dialog')?.close());
  }
  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
}

function openDialog(id: string): void {
  const dialog = document.getElementById(id);
  if (dialog instanceof HTMLDialogElement) dialog.showModal();
}

function wireConsent(): void {
  const notice = elementOf('notice-check', HTMLInputElement);
  const consent = elementOf('consent-check', HTMLInputElement);
  const start = elementOf('start', HTMLButtonElement);
  const confirm = elementOf('notice-confirm', HTMLButtonElement);
  const render = (): void => {
    renderConsent(readConsent(), { notice, consent, start, confirm });
  };
  notice.addEventListener('click', (event) => {
    event.preventDefault();
    openDialog('usage-notice-view');
  });
  confirm.addEventListener('click', () => {
    saveAgreement('notice', createAcceptance(NOTICE_REVISION));
    confirm.closest('dialog')?.close();
    render();
  });
  consent.addEventListener('change', render);
  start.addEventListener('click', () => {
    if (!readConsent().accepted) saveAgreement('terms', createAcceptance(TERMS_REVISION));
    moveTo(APP_PATH, 'push');
  });
  globalThis.addEventListener('storage', (event) => {
    if (event.key === null || isAgreementKey(event.key)) render();
  });
  render();
}

function readConsent(): ConsentState {
  const saved = parseAcceptance(loadAgreement('terms'));
  const accepted = isAccepted(saved);
  return {
    accepted,
    revised: saved !== null && !accepted,
    noticeSeen: isAccepted(parseAcceptance(loadAgreement('notice')), NOTICE_REVISION),
  };
}

function renderConsent(
  state: ConsentState,
  parts: {
    readonly notice: HTMLInputElement;
    readonly consent: HTMLInputElement;
    readonly start: HTMLButtonElement;
    readonly confirm: HTMLButtonElement;
  },
): void {
  const { notice, consent, start, confirm } = parts;
  notice.checked = state.noticeSeen;
  notice.disabled = state.noticeSeen;
  confirm.hidden = state.noticeSeen;
  if (state.accepted) consent.checked = true;
  consent.disabled = state.accepted;
  start.disabled = !state.noticeSeen || (!state.accepted && !consent.checked);
  for (const element of document.querySelectorAll<HTMLElement>('[data-revised]')) {
    element.hidden = !state.revised;
  }
}

function elementOf<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`welcome page: missing element #${id}`);
  return element;
}
