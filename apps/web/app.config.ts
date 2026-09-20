export default defineAppConfig({
  icon: {
    mode: 'svg'
  },
  ui: {
    button: {
      slots: {
        base: 'rounded-md font-medium inline-flex items-center justify-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75 transition-colors'
      },
      compoundVariants: [
        {
          size: 'xs',
          square: true,
          class: 'p-1.5 size-8 inline-flex items-center justify-center'
        },
        {
          size: 'sm',
          square: true,
          class: 'p-2 size-9 inline-flex items-center justify-center'
        },
        {
          size: 'md',
          square: true,
          class: 'p-2 size-10 inline-flex items-center justify-center'
        },
        {
          size: 'lg',
          square: true,
          class: 'p-2.5 size-11 inline-flex items-center justify-center'
        },
        {
          size: 'xl',
          square: true,
          class: 'p-3 size-12 inline-flex items-center justify-center'
        }
      ]
    },
    navigationMenu: {
      slots: {
        link: 'group relative w-full flex items-center justify-start font-medium text-sm before:absolute before:z-[-1] before:rounded-md focus:outline-none focus-visible:outline-none focus-visible:before:outline-3',
        linkLeadingIcon: 'shrink-0 self-center'
      },
      compoundVariants: [
        {
          orientation: 'vertical',
          collapsed: true,
          class: {
            link: 'size-11 justify-center items-center px-0 mx-auto',
            linkLeadingIcon: 'size-5 shrink-0 self-center m-0'
          }
        }
      ]
    }
  }
})
