import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    'vue/multi-word-component-names': 'off',
    // Prettier uses XHTML-style void elements in Vue templates.
    'vue/html-self-closing': 'off'
  }
})
