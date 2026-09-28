import shared from '../../eslint.config.mjs'
import withNuxt from './.nuxt/eslint.config.mjs'

const typedScriptFiles = ['app/**/*.{ts,tsx,mts,cts}']
const typedVueFiles = ['app/**/*.vue']
const sharedWebConfigs = shared.flatMap((config) => {
  if (config.name === '@eslint/js/recommended') {
    return [{ ...config, files: ['**/*.{js,mjs,cjs}'] }]
  }
  if (
    config.name === 'typescript-eslint/base' ||
    config.name === 'typescript-eslint/eslint-recommended'
  ) {
    return [{ ...config, files: typedScriptFiles }]
  }
  if (config.name === 'typescript-eslint/recommended-type-checked') {
    return [{ ...config, files: typedScriptFiles }]
  }
  if (config.files?.includes('**/*.ts')) {
    return [{ ...config, files: typedScriptFiles }]
  }
  return [config]
})

export default withNuxt(
  ...sharedWebConfigs,
  {
    files: ['app/**/*.{ts,tsx,mts,cts,vue}'],
    languageOptions: {
      parserOptions: {
        extraFileExtensions: ['.vue'],
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },
  {
    files: typedVueFiles,
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'vue/multi-word-component-names': 'off',
      // Prettier uses XHTML-style void elements in Vue templates.
      'vue/html-self-closing': 'off'
    }
  }
)
