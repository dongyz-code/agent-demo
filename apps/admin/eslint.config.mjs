import eslintDefault from '@repo/eslint-config';

export default [
  ...eslintDefault,
  {
    rules: {
      'no-async-promise-executor': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
