import tseslint from 'typescript-eslint';
import vitest from 'eslint-plugin-vitest';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';

// Web layering: app -> features -> shared. A feature imports only `@/shared/*` or itself
// (relative paths, at most one subfolder deep); shared never imports features or app.
const upward = (levels) => ({
  group: [`${'../'.repeat(levels)}**`],
  message: 'A feature may only import @/shared/* or files inside itself.',
});
const crossLayer = [
  {
    group: ['@/features/**'],
    message: 'Features import only @/shared/* or themselves (use relative paths).',
  },
  { group: ['@/app/**'], message: 'Features must not import the app layer.' },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    plugins: { '@eslint-community/eslint-comments': eslintComments },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true }],
      // eslint-disable is allowed only per line and with a reason
      '@eslint-community/eslint-comments/no-use': [
        'error',
        { allow: ['eslint-disable-next-line', 'eslint-disable-line'] },
      ],
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
  {
    files: ['apps/web/src/features/*/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...crossLayer, upward(1)] }] },
  },
  {
    files: ['apps/web/src/features/*/*/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [...crossLayer, upward(2)] }] },
  },
  {
    files: ['apps/web/src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/**', '@/app/**', '**/features/**', '**/app/**'],
              message: 'shared must not import features or the app layer.',
            },
          ],
        },
      ],
    },
  },
);
