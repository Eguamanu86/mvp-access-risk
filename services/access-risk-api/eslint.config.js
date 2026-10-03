'use strict'

const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      'no-console': 'error',
      semi: ['error', 'never'],
      quotes: ['error', 'single'],
      indent: ['error', 2],
      curly: ['error', 'all'],
      'no-multiple-empty-lines': ['error', { max: 2 }],
      'comma-dangle': ['error', 'only-multiline'],
    },
  },
]
