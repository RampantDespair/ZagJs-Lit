import type { Linter } from "eslint";

import eslint from "@eslint/js";
import stylisticPlugin from "@stylistic/eslint-plugin";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import {
  createNodeResolver,
  flatConfigs as importXConfigs,
} from "eslint-plugin-import-x";
import { configs as perfectionistConfigs } from "eslint-plugin-perfectionist";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import {
  configs as typescriptConfigs,
  parser as typescriptParser,
} from "typescript-eslint";

// -----------------------------------------------------------------------------
// Rule Overrides
// -----------------------------------------------------------------------------

const rules: Record<string, Partial<Linter.RulesRecord>> = {
  eslint: {
    "array-callback-return": "error",
    "arrow-body-style": ["error", "always"],
    "block-scoped-var": "error",
    "consistent-return": "error",
    curly: ["error", "all"],
    "default-case": "error",
    "default-case-last": "error",
    "default-param-last": ["error"],
    eqeqeq: ["error", "smart"],
    "logical-assignment-operators": "error",
    "no-duplicate-imports": "off",
    "no-else-return": "error",
    "no-inner-declarations": "error",
    "no-invalid-this": "error",
    "no-lonely-if": "error",
    "no-multi-assign": "error",
    "no-param-reassign": "error",
    "no-return-assign": "error",
    "no-script-url": "error",
    "no-self-compare": "error",
    "no-sequences": "error",
    "no-shadow": "error",
    "no-template-curly-in-string": "error",
    "no-unneeded-ternary": "error",
    "no-unreachable-loop": "error",
    "no-use-before-define": "error",
    "no-useless-call": "error",
    "no-useless-computed-key": "error",
    "no-useless-concat": "error",
    "no-useless-return": "error",
    "object-shorthand": "error",
    "operator-assignment": "error",
    "prefer-exponentiation-operator": "error",
    "prefer-numeric-literals": "error",
    "prefer-object-has-own": "error",
    "prefer-object-spread": "error",
    "prefer-regex-literals": "error",
    "prefer-template": "error",
    radix: "error",
    yoda: "error",
  },
  "import-x": {
    "import-x/newline-after-import": ["error", { count: 1 }],
    "import-x/no-duplicates": ["error", { "prefer-inline": false }],
  },
  perfectionist: {
    "perfectionist/sort-imports": [
      "error",
      {
        groups: [
          "side-effect",
          [
            "type-import",
            "type-internal",
            "type-parent",
            "type-sibling",
            "type-index",
          ],
          "value-builtin",
          "value-external",
          "value-internal",
          ["value-parent", "value-sibling", "value-index"],
          "style",
          "unknown",
        ],
        ignoreCase: true,
        newlinesBetween: 1,
        order: "asc",
        tsconfig: { rootDir: import.meta.dirname },
        type: "alphabetical",
      },
    ],
    "perfectionist/sort-modules": "off",
    "perfectionist/sort-union-types": [
      "error",
      {
        groups: [
          "named",
          "keyword",
          "operator",
          "literal",
          "function",
          "import",
          "conditional",
          "object",
          "tuple",
          "intersection",
          "union",
          "unknown",
          "nullish",
        ],
        ignoreCase: true,
        order: "asc",
        type: "alphabetical",
      },
    ],
  },
  stylistic: {
    "@stylistic/brace-style": ["error", "1tbs"],
    "@stylistic/indent": "off",
    "@stylistic/indent-binary-ops": "off",
    "@stylistic/jsx-one-expression-per-line": "off",
    "@stylistic/jsx-self-closing-comp": "error",
    "@stylistic/jsx-wrap-multilines": "off",
    "@stylistic/member-delimiter-style": [
      "error",
      {
        multiline: {
          delimiter: "semi",
          requireLast: true,
        },
        multilineDetection: "brackets",
        singleline: {
          delimiter: "semi",
          requireLast: false,
        },
      },
    ],
    "@stylistic/multiline-ternary": "off",
    "@stylistic/no-extra-semi": "error",
    "@stylistic/operator-linebreak": "off",
    "@stylistic/quote-props": ["error", "as-needed"],
    "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
    "@stylistic/semi": ["error", "always"],
    "@stylistic/type-generic-spacing": "off",
  },
  "typescript-eslint": {
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        disallowTypeAnnotations: true,
        fixStyle: "separate-type-imports",
        prefer: "type-imports",
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/restrict-template-expressions": [
      "error",
      {
        allow: [{ from: "lib", name: ["Error", "URL", "URLSearchParams"] }],
        allowAny: true,
        allowBoolean: true,
        allowNullish: true,
        allowNumber: true,
        allowRegExp: true,
      },
    ],
  },
};

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const tseslintConfig: Partial<Linter.Config>[] = [
  ...typescriptConfigs.strictTypeChecked,
  typescriptConfigs.stylisticTypeChecked.at(-1) ?? {},
];

export default defineConfig(
  // Global ignores (replacement for .eslintignore)
  globalIgnores([
    "dist/**",
    "coverage/**",
    "node_modules/**",
    ".vitest-attachments/**",
    ".vitest/**",
    "tests/__screenshots__/**",
  ]),

  // JavaScript Options
  {
    // Configs
    extends: [
      eslint.configs.recommended,
      tseslintConfig,
      importXConfigs.recommended,
      importXConfigs.typescript,
      perfectionistConfigs["recommended-alphabetical"],
      stylisticPlugin.configs.recommended,
    ],
    // include patterns
    files: ["**/*.{js,ts,mjs,mts,cjs,cts,jsx,tsx}"],
    // options
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.serviceworker,
      },
      parser: typescriptParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      sourceType: "module",
    },
    // rules
    rules: {
      ...rules.eslint,
      ...rules["typescript-eslint"],
      ...rules["import-x"],
      ...rules.perfectionist,
      ...rules.stylistic,
    },
    // settings
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          project: [`${import.meta.dirname}/tsconfig.json`],
        }),
        createNodeResolver(),
      ],
    },
  },
);
