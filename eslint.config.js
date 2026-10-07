import tseslint from 'typescript-eslint';
import vitest from 'eslint-plugin-vitest';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true }],
      // eslint-disable is allowed only per line and with a reason
      '@eslint-community/eslint-comments/no-use': ['error', { allow: ['eslint-disable-next-line', 'eslint-disable-line'] }],
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/test/**', '**/tests/**', 'e2e/**'],
    plugins: { vitest },
    rules: {
      'vitest/no-disabled-tests': 'error',
      'vitest/no-focused-tests': 'error',
    },
  },
  {
    files: ['apps/api/src/domain/**', 'apps/api/src/jobs/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use clock.now() instead of Date.now().',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Use clock.now() instead of new Date() without arguments.',
        },
      ],
    },
  },
);
