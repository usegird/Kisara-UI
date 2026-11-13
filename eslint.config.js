import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// ─────────────────────────────
// 依存方向を機械的に止める。層ごとに「読んではいけない先」を `no-restricted-imports` の patterns で並べる。
// 依存方向の正本はここ。通信は受け口の窓口から、会話の規則は chat/ に置く
// ─────────────────────────────

/** 深い相対パスの禁止。層の規則と同じルールに載せるので、どの層にも付ける */
const DEEP_RELATIVE = { regex: String.raw`^\.\./\.\./`, message: 'エイリアス（@/…）を使う' };

/**
 * デモのページは別の入口。本体のどの層からも読まない。層の規則と同じルールに載せる
 */
const NO_DEMO = { regex: String.raw`^@/demo/`, message: 'demo/ は別のページの入口' };

/**
 * 実行の関門（承諾の関門）。投入と承諾は決まった場所からだけ読む。
 * ほかから読むと、人の確認を経ずに `POST /prompt` へ届く経路になる
 */
const RUN_SUBMIT = {
  regex: String.raw`^@/store/run/run-submit$`,
  message: '実行の投入は実行ボタンと会話の呼び出しの関門からだけ読む',
};
const APPROVE_TOOL_CALL = {
  regex: String.raw`^@/store/run/workflow-tool-run$`,
  importNames: ['approveToolCall', 'rerunToolCall', 'generateToolCall'],
  message: '呼び出しの承諾と実行し直しは、人が押すカードの操作からだけ呼ぶ',
};
/**
 * 同意の関門を通さない窓口の入れ方。通信しない公開用のデモ（層の規則の外）だけが読む
 */
const UNGUARDED_PORT = {
  regex: String.raw`^@/store/ports/comfy-port$`,
  importNames: ['installComfyPortWithoutConsent'],
  message: '同意の関門を通さない入れ方は公開用のデモだけ',
};
const RUN_GATE = [RUN_SUBMIT, APPROVE_TOOL_CALL, UNGUARDED_PORT];

/**
 * 層ごとの禁止方向。`regex` は import 元の文字列に対する正規表現
 * （gitignore 風の `group` は、親を除外した下の子を `!` で戻せないので使わない）。
 * `gate` は実行の関門。関門を持つファイルだけ、層の規則を写して外す（下の「関門を持つ場所」）
 */
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

// ─────────────────────────────
// 画面の文言は言語ごとの表にだけ書く。表の外の日本語の文字列を止める。
// 注釈と console への出力（開発用）は対象外。表へ移し終えた場所から順に広げる
// ─────────────────────────────

/** ひらがな・カタカナ・漢字（CJK 統合漢字と拡張 A） */
const JAPANESE = String.raw`/[぀-ヿ㐀-鿿]/u`;
const IN_CONSOLE = 'CallExpression[callee.object.name="console"]';
const NO_JAPANESE_MESSAGE = '画面の文言は src/i18n/locales/ の表に置き、t() で引く';

/**
 * 読み込んだ時点の t() は言語を決める前なので英語になる。関数の中で引く
 */
const MODULE_LEVEL_T = {
  selector: 'CallExpression[callee.name="t"]:not(:function CallExpression)',
  message: 't() は関数の中で呼ぶ（読み込んだ時点では言語が決まっていない）',
};

/** 対象の場所 */
const I18N_DONE = ['src/**/*.{ts,tsx}'];

/**
 * 対象から外すもの。
 * - 言語の名前をその言語で出す一覧（訳さない名前）
 * - 開発用の道具（利用者に届かない）
 * - 近似判定のモデルに渡す決まった文（画面に出ない）
 */
const I18N_EXEMPT = [
  'src/i18n/locales.ts',
  'src/chat/semantic-models.ts',
  'src/graph/template-locales.ts',
  'src/components/app/PerfStatsBar.tsx',
  'src/store/install/install-dev-data.ts',
];

// ─────────────────────────────
// 形の規則。大きさ・入れ子・複雑さ・引数の数・数値・命名・JSDoc を止める。
// ─────────────────────────────

/** 大きさと入れ子の上限。部品の大きさの上限もここが正本 */
const SHAPE_RULES = {
  'max-depth': ['error', 4],
  complexity: ['error', 15],
  'max-params': ['error', 4],
  'max-nested-callbacks': ['error', 3],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
};

/** 部品は 1 つの関数が描く部分まで持つので、関数の長さは部品 1 つ分（300 行）まで許す */
const COMPONENT_FUNCTION_LINES = ['error', { max: 300, skipBlankLines: true, skipComments: true }];

/** 数はファイル先頭の定数にする（関数の中の const も対象）。-1・0・1・2 と、型や添字の数は対象外 */
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

/** 型は PascalCase、関数・変数は camelCase（部品は PascalCase）、最上位の定数は UPPER_SNAKE も可 */
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
  // 外の形（JSON の鍵・ライブラリの項目）に合わせる名前は縛らない。分割代入はその鍵の名前になる
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

/**
 * JSDoc は TSDoc 流（型も既定値も書かない）。開発用のメタ情報のタグ（@design・@measured）だけを足す。
 * export する関数・型には付ける。`@param` は要るものだけ書けばよい
 */
const JSDOC_RULES = {
  'jsdoc/check-tag-names': ['error', { definedTags: ['design', 'measured'], typed: true }],
  'jsdoc/no-types': 'error',
  'jsdoc/no-defaults': 'error',
  'jsdoc/check-param-names': ['error', { disableMissingParamChecks: true }],
  'jsdoc/require-hyphen-before-param-description': 'error',
  'jsdoc/no-bad-blocks': 'error',
  'jsdoc/check-alignment': 'error',
  'jsdoc/require-jsdoc': [
    'error',
    {
      publicOnly: true,
      require: { FunctionDeclaration: true, ArrowFunctionExpression: true },
      contexts: ['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'],
    },
  ],
};

const REACT = String.raw`react(-dom)?(/|$)`;
const ZUSTAND = String.raw`zustand(/|$)`;

// 関門を持つ場所が使う層の規則（写すので名前を付ける）
const STORE_LAYER = [
  `^(@/(components|hooks|comfy|llm)/|${REACT})`,
  'store/ は queue/・chat/・graph/・port/・lib/ だけを参照する。通信は受け口の窓口から',
];
const HOOKS_LAYER = [
  String.raw`^@/(components|comfy|llm)/`,
  'hooks/ は components/・comfy/・llm/ を参照しない。通信は受け口の窓口から',
];
/** components/comfy/ のどのフォルダも読まない先（app/・会話の部品・通信の実装） */
const COMFY_COMPONENTS_COMMON = String.raw`components/(app|llm)/|llm/|comfy/`;
const LLM_COMPONENTS_LAYER = [
  String.raw`^@/(components/(app|comfy)/|comfy/|llm/)`,
  'components/llm/ は ComfyUI の層と通信の実装を参照しない',
];

export default tseslint.config(
  // .claude: 作業ツリー（.claude/worktrees）が別のチェックアウトを丸ごと持つため
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

      // any 禁止・未使用を残さない・行長 100 字
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'max-len': ['error', { code: 100, ignoreUrls: true, ignoreStrings: true }],

      // import 順序は Prettier（@ianvs/prettier-plugin-sort-imports）が担当する。
      // 深い相対パス禁止（エイリアスを使う）
      'no-restricted-imports': ['error', { patterns: [DEEP_RELATIVE] }],
    },
  },

  {
    // 形の規則。大きさと数はアプリのコードだけ（テストは describe の中に長い手順と期待の数を並べる）
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
    // 命名と JSDoc の形はテストにも掛ける（@design・@measured の綴りの誤りもここで拾う）
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
    // テストの関数は export しないので、JSDoc を求めない
    files: ['tests/**/*.{ts,tsx}'],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  },

  // ── 依存方向。下の層ほど読める先が少ない ──
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
  // 失敗は理由の符号で返し、文言は画面の側が引くので、文言の表（i18n/）も読まない
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
  // components/ の中は app/ → ui/ と comfy/ → comfy/flow/ → ui/ の一方向だけ（逆流禁止）
  boundary(
    ['src/components/ui/**'],
    String.raw`^@/components/(app|comfy|llm|shared)/`,
    'ui/ は上の層の部品を参照しない',
  ),
  // 両方の種別の層が使う画面の部品。種別の層と外枠を読まず、通信は受け口の窓口から
  boundary(
    ['src/components/shared/**'],
    String.raw`^@/(components/(app|comfy|llm)/|comfy/|llm/)`,
    'shared/ は外枠・種別の層の部品と通信の実装を参照しない',
  ),
  // components/comfy/ はどこも app/・会話の層・通信の実装を読まない。通信は受け口の窓口から。
  // 同じ規則の設定は後のものが前を上書きするので、下のフォルダの規則はこの禁止も含めて書く
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
  // comfy/ の下のフォルダは直下（枠）を読まず、互いにも読まない。共有するものは使う側の下へ置く
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
  // app/ は種別を知らない。欄の中身は種別の層が組み、組み立ての根（App.tsx）が外枠に渡す
  boundary(
    ['src/components/app/**'],
    String.raw`^@/((comfy|llm)/|components/(comfy|llm|shared)/|` +
      String.raw`hooks/comfy/use-(comfy-|workflow-io)|store/use-(graph|chat)-)`,
    'app/ は ComfyUI と LLM の API・部品・状態を知らない。種別の部品は App.tsx から受け取る',
  ),
  // 本体の入口もデモを読まない。NO_DEMO は既に載るので、同じ物を 2 つ並べないよう別の形で書く
  boundary(['src/main.tsx', 'src/App.tsx'], String.raw`^@/demo/.`, NO_DEMO.message),
  // ゲートウェイは API キーを持つ別のオリジンのページ。本体の部品・状態を読まない
  boundary(
    ['src/gateway/**'],
    `^(@/(?!gateway/|llm/|port/|lib/|i18n(/|$))|${REACT}|${ZUSTAND})`,
    'gateway/ は llm/・port/・lib/・i18n/ だけを参照する',
  ),

  // ── 関門を持つ場所。層の規則はそのまま、持つ関門だけを外す ──
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
    // 読み込んだ時点の t() は言語を決める前なので英語になる。関数の中で引く
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', MODULE_LEVEL_T],
    },
  },
  {
    files: I18N_DONE,
    ignores: I18N_EXEMPT,
    rules: {
      // 同じ規則を後の設定で書くと前のものを置き換えるので、MODULE_LEVEL_T も並べる
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
    // 保存の前の形の読み替え・移し替えは src/store/upgrade/ の 1 か所にだけ書く。
    // ほかの場所で legacy・migrat を含む名前を付けたら止める（外の形式との互換は別の名前にする）
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
    // 設定ファイルは Node 実行。JS は型情報を使う規則の対象外にする
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node },
  },
  {
    files: ['vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // shadcn/ui の生成物。upstream の書き方をそのまま保つ
    files: ['src/components/ui/**'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
