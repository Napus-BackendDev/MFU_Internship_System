/**
 * Verdana Health Nuxt UI runtime theme reference.
 * Keep synchronized with apps/web/app/app.config.ts.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'navy',
      secondary: 'sage',
      success: 'success',
      info: 'info',
      warning: 'warning',
      error: 'error',
      neutral: 'slate'
    },
    icons: {
      check: 'i-lucide-check',
      chevronDown: 'i-lucide-chevron-down',
      chevronRight: 'i-lucide-chevron-right',
      close: 'i-lucide-x',
      external: 'i-lucide-external-link',
      loading: 'i-lucide-loader-circle',
      menu: 'i-lucide-menu',
      search: 'i-lucide-search'
    },
    button: {
      slots: {
        base: [
          'min-h-11 gap-2 rounded-lg px-[var(--component-button-padding-inline)] font-semibold',
          'transition-colors duration-150',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-40'
        ].join(' ')
      },
      defaultVariants: { size: 'md' }
    },
    badge: {
      slots: {
        base: 'min-h-6 gap-1.5 rounded px-3 font-medium uppercase tracking-[0.03125rem]'
      },
      defaultVariants: { size: 'md', variant: 'subtle' }
    },
    card: {
      slots: {
        root: 'rounded-lg border border-default bg-default shadow-none',
        header: 'px-4 pt-4 pb-0 sm:px-6 sm:pt-6',
        body: 'p-4 sm:p-6',
        footer: 'px-4 pt-0 pb-4 sm:px-6 sm:pb-6'
      }
    },
    formField: {
      slots: {
        root: 'space-y-1.5',
        label: 'text-sm font-medium text-highlighted',
        description: 'text-xs leading-5 text-muted',
        error: 'text-xs leading-5 text-error'
      }
    },
    input: {
      slots: {
        root: 'min-h-11',
        base: [
          'min-h-11 rounded-lg border-default px-3.5 text-base sm:text-sm',
          'hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/10'
        ].join(' ')
      },
      defaultVariants: { size: 'md', variant: 'outline' }
    },
    textarea: {
      slots: {
        base: [
          'min-h-28 rounded-lg border-default px-3.5 py-2.5 text-base sm:text-sm',
          'hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/10'
        ].join(' ')
      },
      defaultVariants: { size: 'md', variant: 'outline' }
    },
    select: {
      slots: {
        base: [
          'min-h-11 rounded-lg border-default px-3.5 text-base sm:text-sm',
          'hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/10'
        ].join(' ')
      },
      defaultVariants: { size: 'md', variant: 'outline' }
    },
    alert: {
      slots: {
        root: 'rounded-lg border',
        title: 'font-semibold',
        description: 'leading-6'
      }
    },
    modal: {
      slots: {
        content:
          'max-w-[var(--component-dialog-max-width)] rounded-xl shadow-[var(--shadow-lg)]',
        header: 'border-b border-muted px-6 py-4',
        body: 'px-6 py-5',
        footer: 'border-t border-muted px-6 py-4'
      }
    },
    tooltip: {
      slots: {
        content:
          'max-w-60 rounded-lg bg-inverted px-3 py-1.5 text-xs leading-5 text-inverted'
      }
    }
  }
})
