import { createEyeIcon } from '@/gateway/entry-icons';
import { initLocale, t } from '@/i18n';
import { isLocaleCode } from '@/i18n/locales';
import { installTrustedTypes } from '@/lib/trusted-types';
import { parseHttpBaseUrl } from '@/lib/web-url';
import { GATEWAY_ORIGIN } from '@/llm/gateway-origins';
import { KEY_TYPE, parseVerifiedMessage, postKeyToOpener } from '@/llm/gateway-protocol';
import type { LlmKeyOutcome } from '@/port/llm-port';

import './entry.css';

const VERIFY_TIMEOUT_MS = 30_000;

type Opener = NonNullable<Parameters<typeof postKeyToOpener>[0]>;

interface EntryFields {
  readonly url: HTMLInputElement;
  readonly key: HTMLInputElement;
  readonly error: HTMLElement;
}

installTrustedTypes();
void start();

async function start(): Promise<void> {
  const params = new URLSearchParams(globalThis.location.hash.slice(1));
  const lang = params.get('lang');
  await initLocale(lang !== null && isLocaleCode(lang) ? lang : undefined);
  document.title = t('gateway.entry.title');
  const root = document.getElementById('entry');
  if (root !== null) renderEntry(root, params.get('base') ?? '');
}

function renderEntry(root: HTMLElement, initialUrl: string): void {
  const opener = openerOf();
  root.append(element('h1', t('gateway.entry.title')));
  if (opener === null) {
    root.append(element('p', t('gateway.entry.noOpener'), 'error'));
    return;
  }
  const form = document.createElement('form');
  const fields: EntryFields = {
    url: input('text', 'username', 'username', initialUrl),
    key: input('password', 'password', 'current-password', ''),
    error: element('p', '', 'error'),
  };
  fields.error.setAttribute('role', 'alert');
  form.append(
    labeled(t('llm.connection.baseUrl'), fields.url),
    keyField(fields.key),
    fields.error,
    submitButton(),
  );
  fields.url.addEventListener('input', () => {
    fields.error.textContent = '';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(form, fields, opener);
  });
  root.append(form);
  (initialUrl.length > 0 ? fields.key : fields.url).focus();
}

function submit(form: HTMLFormElement, fields: EntryFields, opener: Opener): void {
  const parsed = parseHttpBaseUrl(fields.url.value);
  const key = fields.key.value.trim();
  if (parsed.kind !== 'ok') {
    fields.error.textContent = t('gateway.entry.invalidUrl');
    return;
  }
  if (key.length === 0) {
    fields.key.focus();
    return;
  }
  const checking = element('p', t('gateway.entry.checking'));
  checking.setAttribute('role', 'status');
  form.replaceWith(checking);
  void waitForOutcome().then((outcome) => {
    if (outcome !== 'ok') {
      checking.replaceWith(failedView(outcome, form, fields.key));
      return;
    }
    void requestSave(fields.url.value, key);
    checking.replaceWith(doneView());
  });
  postKeyToOpener(opener, { type: KEY_TYPE, baseUrl: parsed.url, key }, GATEWAY_ORIGIN);
}

function waitForOutcome(): Promise<LlmKeyOutcome> {
  return new Promise((resolve) => {
    const finish = (outcome: LlmKeyOutcome): void => {
      globalThis.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(outcome);
    };
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== GATEWAY_ORIGIN) return;
      const outcome = parseVerifiedMessage(event.data);
      if (outcome !== null) finish(outcome);
    };
    const timer = setTimeout(() => finish('failed'), VERIFY_TIMEOUT_MS);
    globalThis.addEventListener('message', onMessage);
  });
}

function failedView(
  outcome: 'auth' | 'failed',
  form: HTMLFormElement,
  key: HTMLInputElement,
): HTMLElement {
  const view = element('div', '', 'done');
  const text = outcome === 'auth' ? 'gateway.entry.authFailed' : 'gateway.entry.verifyFailed';
  const message = element('p', t(text), 'error');
  message.setAttribute('role', 'alert');
  const back = element('button', t('gateway.entry.back'));
  back.setAttribute('type', 'button');
  back.addEventListener('click', () => {
    view.replaceWith(form);
    key.focus();
  });
  view.append(message, back);
  queueMicrotask(() => back.focus());
  return view;
}

async function requestSave(id: string, password: string): Promise<void> {
  const Credential: unknown = Reflect.get(globalThis, 'PasswordCredential');
  if (typeof Credential !== 'function' || !('credentials' in navigator)) return;
  try {
    const credential = Reflect.construct(Credential, [{ id, password }]) as Credential;
    await navigator.credentials.store(credential);
  } catch {
  }
}

function doneView(): HTMLElement {
  const view = element('div', '', 'done');
  const message = element('p', t('gateway.entry.verified'));
  message.setAttribute('role', 'status');
  const close = element('button', t('gateway.entry.close'));
  close.setAttribute('type', 'button');
  close.addEventListener('click', () => globalThis.close());
  view.append(message, close);
  queueMicrotask(() => close.focus());
  return view;
}

function submitButton(): HTMLButtonElement {
  const button = element('button', t('gateway.entry.submit'));
  button.setAttribute('type', 'submit');
  return button;
}

function keyField(key: HTMLInputElement): HTMLElement {
  const label = element('label', t('llm.connection.apiKey'));
  const box = element('div', '', 'key-box');
  box.append(key, eyeToggle(key));
  label.append(box);
  return label;
}

function eyeToggle(key: HTMLInputElement): HTMLButtonElement {
  const button = element('button', '', 'eye');
  button.setAttribute('type', 'button');
  const show = (shown: boolean): void => {
    key.type = shown ? 'text' : 'password';
    button.setAttribute(
      'aria-label',
      t(shown ? 'llm.connection.hideKey' : 'llm.connection.showKey'),
    );
    button.replaceChildren(createEyeIcon(shown));
  };
  button.addEventListener('click', () => show(key.type === 'password'));
  show(false);
  return button;
}

function openerOf(): Opener | null {
  const opener: unknown = Reflect.get(globalThis, 'opener');
  return isOpener(opener) ? opener : null;
}

function isOpener(value: unknown): value is Opener {
  return typeof value === 'object' && value !== null && 'frames' in value;
}

function labeled(text: string, field: HTMLInputElement): HTMLLabelElement {
  const label = element('label', text);
  label.append(field);
  return label;
}

function input(type: string, name: string, autocomplete: string, value: string): HTMLInputElement {
  const field = document.createElement('input');
  field.type = type;
  field.name = name;
  field.setAttribute('autocomplete', autocomplete);
  field.value = value;
  field.spellcheck = false;
  return field;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className !== undefined) node.className = className;
  return node;
}
