import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const DEEP_RELATIVE = { regex: String.raw`^\.\./\.\./`, message: 'エイリアス（@/…）を使う' };

const NO_DEMO = { regex: String.raw`^@/demo/`, message: 'demo/ は別のページの入口' };

const RUN_SUBMIT = {
  regex: String.raw`^@/store/run/run-submit$`,
  message: '実行の投入は実行ボタンと会話の呼び出しの関門からだけ読む',
};
const APPROVE_TOOL_CALL = {
  regex: String.raw`^@/store/run/workflow-tool-run$`,
  importNames: ['approveToolCall', 'rerunToolCall', 'generateToolCall'],
  message: '呼び出しの承諾と実行し直しは、人が押すカードの操作からだけ呼ぶ',
};
const UNGUARDED_PORT = {
  regex: String.raw`^@/store/ports/comfy-port$`,
  importNames: ['installComfyPortWithoutConsent'],
  message: '同意の関門を通さない入れ方は公開用のデモだけ',
};
const RUN_GATE = [RUN_SUBMIT, APPROVE_TOOL_CALL, UNGUARDED_PORT];

function boundary(files, regex, message, ignores = [], gate = RUN_GATE) {
  return {
    files,
    ignores,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [DEEP_RELATIVE, NO_DEMO, ...gate, { regex, message }] },
      ],
    },
  };
}

const JAPANESE = String.raw`/[぀-ヿ㐀-鿿]/u`;
const IN_CONSOLE = 'CallExpression[callee.object.name="console"]';
const NO_JAPANESE_MESSAGE = '画面の文言は src/i18n/locales/ の表に置き、t() で引く';

const MODULE_LEVEL_T = {
  selector: 'CallExpression[callee.name="t"]:not(:function CallExpression)',
  message: 't() は関数の中で呼ぶ（読み込んだ時点では言語が決まっていない）',
};

const I18N_DONE = ['src/**/*.{ts,tsx}'];

const I18N_EXEMPT = [
  'src/i18n/locales.ts',
  'src/chat/semantic-models.ts',
  'src/graph/template-locales.ts',
  'src/components/app/PerfStatsBar.tsx',
  'src/store/install/install-dev-data.ts',
];

const SHAPE_RULES = {
  'max-depth': ['error', 4],
  complexity: ['error', 15],
  'max-params': ['error', 4],
  'max-nested-callbacks': ['error', 3],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
};

const COMPONENT_FUNCTION_LINES = ['error', { max: 300, skipBlankLines: true, skipComments: true }];

const MAGIC_NUMBERS = [
  'error',
  {
    ignore: [-1, 0, 1, 2],
    enforceConst: true,
    ignoreEnums: true,
    ignoreNumericLiteralTypes: true,
    ignoreReadonlyClassProperties: true,
    ignoreClassFieldInitialValues: true,
    ignoreTypeIndexes: true,
    ignoreArrayIndexes: true,
  },
];

const NAMING = [
  'error',
  { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
  {
    selector: 'variable',
    modifiers: ['const', 'global'],
    format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
  },
  { selector: 'variable', format: ['camelCase', 'PascalCase'] },
  { selector: 'function', format: ['camelCase', 'PascalCase'] },
  { selector: 'parameter', format: ['camelCase', 'PascalCase'], leadingUnderscore: 'allow' },
  { selector: 'typeLike', format: ['PascalCase'] },
  {
    selector: [
      'objectLiteralProperty',
      'typeProperty',
      'objectLiteralMethod',
      'enumMember',
      'import',
    ],
    format: null,
  },
  { selector: 'variable', modifiers: ['destructured'], format: null },
];

const JSDOC_RULES = {
  'jsdoc/check-tag-names': ['error', { definedTags: ['design', 'measured'], typed: true }],
  'jsdoc/no-types': 'error',
  'jsdoc/no-defaults': 'error',
  'jsdoc/check-param-names': ['error', { disableMissingParamChecks: true }],
  'jsdoc/require-hyphen-before-param-description': 'error',
  'jsdoc/no-bad-blocks': 'error',
  'jsdoc/check-alignment': 'error',
};

const REACT = String.raw`react(-dom)?(/|$)`;
const ZUSTAND = String.raw`zustand(/|$)`;

const STORE_LAYER = [
  `^(@/(components|hooks|comfy|llm)/|${REACT})`,
  'store/ は queue/・chat/・graph/・port/・lib/ だけを参照する。通信は受け口の窓口から',
];
const HOOKS_LAYER = [
  String.raw`^@/(components|comfy|llm)/`,
  'hooks/ は components/・comfy/・llm/ を参照しない。通信は受け口の窓口から',
];
const COMFY_COMPONENTS_COMMON = String.raw`components/(app|llm)/|llm/|comfy/`;
const LLM_COMPONENTS_LAYER = [
  String.raw`^@/(components/(app|comfy)/|comfy/|llm/)`,
  'components/llm/ は ComfyUI の層と通信の実装を参照しない',
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-profiling',
      'dist-demo',
      'dist-gateway',
      '.dev-data',
      'node_modules',
      'workflow_sample',
      '.claude',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: true }],

      'no-restricted-imports': ['error', { patterns: [DEEP_RELATIVE] }],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.d.ts'],
    rules: {
      ...SHAPE_RULES,
      '@typescript-eslint/no-magic-numbers': MAGIC_NUMBERS,
    },
  },
  {
    files: ['src/**/*.tsx'],
    rules: { 'max-lines-per-function': COMPONENT_FUNCTION_LINES },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    ignores: ['src/**/*.d.ts'],
    plugins: { jsdoc },
    settings: { jsdoc: { mode: 'typescript' } },
    rules: {
      ...JSDOC_RULES,
      '@typescript-eslint/naming-convention': NAMING,
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  },

  boundary(['src/lib/**'], `^(@/(?!lib/)|${REACT})`, 'lib/ は lib/ の外を参照しない'),
  boundary(
    ['src/i18n/**'],
    `^(@/(?!i18n(/|$)|lib/)|${REACT})`,
    'i18n/ は lib/ だけを参照し、React に依存しない',
  ),
  boundary(
    ['src/graph/**'],
    `^(@/(?!graph/|i18n(/|$)|lib/)|${REACT}|${ZUSTAND})`,
    'graph/ は i18n/ と lib/ だけを参照する純関数',
  ),
  boundary(
    ['src/port/**'],
    `^(@/(?!port/|graph/|lib/)|${REACT}|${ZUSTAND})`,
    'port/ は通信の窓口の型だけを持ち、graph/ と lib/ だけを参照する',
  ),
  boundary(
    ['src/comfy/**'],
    `^(@/(store|components|hooks)/|@/i18n(/|$)|${REACT}|${ZUSTAND})`,
    'comfy/ は graph/・port/・lib/ だけを参照し、React と文言の表（i18n/）に依存しない。' +
      '失敗は理由の符号で返す',
  ),
  boundary(
    ['src/llm/**'],
    `^(@/(?!llm/|port/|lib/)|${REACT}|${ZUSTAND})`,
    'llm/ は port/ と lib/ だけを参照し、React に依存しない',
  ),
  boundary(
    ['src/chat/**'],
    `^(@/(?!chat/|port/|lib/)|${REACT}|${ZUSTAND})`,
    'chat/ は port/ と lib/ だけを参照する純関数',
  ),
  boundary(
    ['src/queue/**'],
    `^(@/(store|components|hooks|comfy)/|${REACT}|${ZUSTAND})`,
    'queue/ は graph/・port/・lib/ だけを参照する純関数',
  ),
  boundary(['src/store/**'], ...STORE_LAYER),
  boundary(['src/hooks/**'], ...HOOKS_LAYER),
  boundary(
    ['src/components/ui/**'],
    String.raw`^@/components/(app|comfy|llm|shared)/`,
    'ui/ は上の層の部品を参照しない',
  ),
  boundary(
    ['src/components/shared/**'],
    String.raw`^@/(components/(app|comfy|llm)/|comfy/|llm/)`,
    'shared/ は外枠・種別の層の部品と通信の実装を参照しない',
  ),
  boundary(
    ['src/components/comfy/**'],
    `^@/(${COMFY_COMPONENTS_COMMON})`,
    'comfy/ は app/・会話の層・通信の実装（comfy/・llm/）を参照しない',
    ['src/components/comfy/{flow,queue,dialogs}/**'],
  ),
  boundary(
    ['src/components/comfy/flow/**'],
    String.raw`^@/(components/(app/|llm/|comfy/(?!flow/))|llm/|comfy/)`,
    'comfy/flow/ はタブ全体の操作（comfy/ 直下・queue・dialogs）・会話の層・通信の実装を参照しない',
  ),
  boundary(
    ['src/components/comfy/queue/**'],
    String.raw`^@/(${COMFY_COMPONENTS_COMMON}|components/comfy/([^/]+$|dialogs/))`,
    'comfy/queue/ は comfy/ 直下・dialogs/・app/・会話の層・通信の実装を参照しない',
  ),
  boundary(
    ['src/components/comfy/dialogs/**'],
    String.raw`^@/(${COMFY_COMPONENTS_COMMON}|components/comfy/([^/]+$|queue/))`,
    'comfy/dialogs/ は comfy/ 直下・queue/・app/・会話の層・通信の実装を参照しない',
  ),
  boundary(['src/components/llm/**'], ...LLM_COMPONENTS_LAYER),
  boundary(
    ['src/components/app/**'],
    String.raw`^@/((comfy|llm)/|components/(comfy|llm|shared)/|` +
      String.raw`hooks/comfy/use-(comfy-|workflow-io)|store/use-(graph|chat)-)`,
    'app/ は ComfyUI と LLM の API・部品・状態を知らない。種別の部品は App.tsx から受け取る',
  ),
  boundary(['src/main.tsx', 'src/App.tsx'], String.raw`^@/demo/.`, NO_DEMO.message),
  boundary(
    ['src/gateway/**'],
    `^(@/(?!gateway/|llm/|port/|lib/|i18n(/|$))|${REACT}|${ZUSTAND})`,
    'gateway/ は llm/・port/・lib/・i18n/ だけを参照する',
  ),
  boundary(
    ['src/welcome/**'],
    String.raw`^(@/(?!welcome/|lib/|i18n/locales$|store/persist/agreements$)|` +
      `${REACT}|${ZUSTAND})`,
    'welcome/ は lib/・i18n/locales・store/persist/agreements だけを参照する',
  ),

  boundary(
    ['src/hooks/run/use-run-workflow.ts'],
    ...HOOKS_LAYER,
    [],
    [APPROVE_TOOL_CALL, UNGUARDED_PORT],
  ),
  boundary(
    ['src/store/run/workflow-tool-run.ts'],
    ...STORE_LAYER,
    [],
    [APPROVE_TOOL_CALL, UNGUARDED_PORT],
  ),
  boundary(
    ['src/components/llm/message/ToolCallCard.tsx'],
    ...LLM_COMPONENTS_LAYER,
    [],
    [RUN_SUBMIT, UNGUARDED_PORT],
  ),

  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', MODULE_LEVEL_T],
    },
  },
  {
    files: I18N_DONE,
    ignores: I18N_EXEMPT,
    rules: {
      'no-restricted-syntax': [
        'error',
        MODULE_LEVEL_T,
        {
          selector: `Literal[value=${JAPANESE}]:not(${IN_CONSOLE} > Literal)`,
          message: NO_JAPANESE_MESSAGE,
        },
        {
          selector: `TemplateElement[value.raw=${JAPANESE}]:not(${IN_CONSOLE} > TemplateLiteral > TemplateElement)`,
          message: NO_JAPANESE_MESSAGE,
        },
        { selector: `JSXText[value=${JAPANESE}]`, message: NO_JAPANESE_MESSAGE },
      ],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/store/upgrade/**'],
    rules: {
      'id-match': [
        'error',
        '^(?!.*(?:[Ll]egacy|LEGACY|[Mm]igrat|MIGRAT)).*$',
        { properties: true, classFields: true, onlyDeclarations: false },
      ],
    },
  },

  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }] } },
);
