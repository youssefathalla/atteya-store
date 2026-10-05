// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: ['.agents/**', 'dist/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // 1. Force Signal-based APIs (input, output, viewChild, etc.)
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-signal-model': 'error',
      '@angular-eslint/no-uncalled-signals': 'error',
      // 2. Dependency Injection: Prefer inject() over constructor
      '@angular-eslint/prefer-inject': 'error',

      // 3. Strict Types & Decorators
      '@angular-eslint/no-attribute-decorator': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/no-output-rename': 'error',

      // 4. Component Best Practices
      '@angular-eslint/use-component-view-encapsulation': 'warn',

      // 5. Types & Global Rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // 6. Architecture Enforcement
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Property[key.name="standalone"][value.value=true]',
          message:
            'The "standalone: true" property is the default in Angular v22+ and MUST be omitted according to project LIFT rules.',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // 5. Force modern control flow (@if, @for)
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/no-interpolation-in-attributes': 'error',

      // 6. Clean Templates
      '@angular-eslint/template/prefer-self-closing-tags': 'error',
      '@angular-eslint/template/conditional-complexity': ['error', { maxComplexity: 3 }],
      '@angular-eslint/template/button-has-type': 'error',
    },
  },
]);
