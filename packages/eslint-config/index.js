import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
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
      "@typescript-eslint/no-explicit-any": "off"
    },
  },
];
