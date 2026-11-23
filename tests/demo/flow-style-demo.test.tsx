// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { installDemoDefinitions, openDemoSample } from '@/demo/demo-data';
import { DEMO_INTRO_KEY } from '@/demo/DemoIntro';
import { FlowStyleDemo } from '@/demo/FlowStyleDemo';
import { NARROW_SCREEN_QUERY } from '@/hooks/ui/use-narrow-screen';

import { stubMediaQuery, stubMissingDom } from '../helpers/dom';

beforeAll(() => {
  stubMissingDom();
});

beforeEach(() => {
  localStorage.setItem(DEMO_INTRO_KEY, '1');
  installDemoDefinitions();
  openDemoSample();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('デモの見出しの帯', () => {
  it('広い画面では説明と操作を帯に並べ、メニューは出さない', () => {
    stubMediaQuery(NARROW_SCREEN_QUERY, false);
    render(<FlowStyleDemo />);
    expect(screen.getByRole('button', { name: 'ファイルを開く' })).toBeDefined();
    expect(screen.getByRole('button', { name: '見本に戻す' })).toBeDefined();
    expect(screen.getByText('ノードベースをフローベース化にした優位性検証')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'このデモについて' })).toBeNull();
  });

  it('狭い画面では名前とメニューのボタンだけで、開くと説明と操作が出る', async () => {
    stubMediaQuery(NARROW_SCREEN_QUERY, true);
    render(<FlowStyleDemo />);
    expect(screen.queryByText('ファイルを開く')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'このデモについて' }));

    expect(await screen.findByRole('menuitem', { name: 'ファイルを開く' })).toBeDefined();
    expect(screen.getByRole('menuitem', { name: '見本に戻す' })).toBeDefined();
    expect(screen.getByText('ノードベースをフローベース化にした優位性検証')).toBeDefined();
  });
});

describe('初めて開いたときの案内の帯', () => {
  const BODY = /線をたどってカードを見て/;

  it('初めては出し、閉じたら次からは出さない', () => {
    localStorage.clear();
    render(<FlowStyleDemo />);
    expect(screen.getByText(BODY)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(screen.queryByText(BODY)).toBeNull();
    cleanup();

    render(<FlowStyleDemo />);
    expect(screen.queryByText(BODY)).toBeNull();
  });
});
