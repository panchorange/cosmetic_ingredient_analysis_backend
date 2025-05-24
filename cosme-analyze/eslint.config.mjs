// eslint.config.mjs
import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

// Prettier関連のプラグインと設定をインポート
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: {
      js,
      prettier: prettierPlugin,
    },
    extends: [
      js.configs.recommended, // "@eslint/js" の推奨設定
      prettierConfig, // eslint-config-prettier をextendsに含める
    ],
    rules: {
      'prettier/prettier': 'error', // Prettierのルールに違反したらエラー
      // その他のESLintルール（必要であれば）
      // 例: "no-unused-vars": "warn",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      ecmaVersion: 'latest', // 最新のECMAScriptバージョンに対応
      sourceType: 'module', // ES Modules構文を許可
    },
  },
]);
