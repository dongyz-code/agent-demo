import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import perfectionist from 'eslint-plugin-perfectionist';

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  /** perfectionist：仅排序 import，不触碰对象/JSX/类型成员的顺序 */
  {
    plugins: { perfectionist },
    rules: {
      'perfectionist/sort-imports': ['error', {
        type: 'natural',
        order: 'asc',
        internalPattern: ['^@/.+', '^@repo/.+'],
        newlinesBetween: 1,
      }],
    },
  },
  /** ------------- */
  {
    rules: {
      'no-async-promise-executor': 'off',
      'no-useless-catch': 'warn',
      'no-empty-pattern': 'warn',
      /** --------------------- */
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
];
