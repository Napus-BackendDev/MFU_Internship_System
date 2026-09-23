import { resolvePublicAppEnvironment } from './app/utils/app-environment'

export default defineNuxtConfig({
  app: {
    head: {
      link: [
        {
          href: '/brand/mfu-coed-logo.svg',
          rel: 'icon',
          type: 'image/svg+xml'
        }
      ],
      meta: [
        { content: '#ac1515', name: 'theme-color' },
        {
          content:
            'ระบบจัดการการฝึกงานและ Internship Transcript มหาวิทยาลัยแม่ฟ้าหลวง',
          name: 'description'
        }
      ],
      title: 'MFU Internship Transcript'
    }
  },
  compatibilityDate: '2026-08-23',
  css: ['~/assets/css/main.css'],
  devServer: {
    host: '0.0.0.0',
    port: 8080
  },
  devtools: {
    enabled: process.env.NODE_ENV === 'development'
  },
  eslint: {
    config: {
      stylistic: false
    }
  },
  future: {
    compatibilityVersion: 4
  },
  i18n: {
    defaultLocale: 'th',
    detectBrowserLanguage: false,
    langDir: 'locales',
    locales: [
      {
        code: 'th',
        file: 'th.json',
        language: 'th-TH',
        name: 'ไทย'
      },
      {
        code: 'en',
        file: 'en.json',
        language: 'en-US',
        name: 'English'
      }
    ],
    strategy: 'prefix_except_default'
  },
  icon: {
    mode: 'svg',
    serverBundle: {
      collections: ['lucide']
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 512,
      icons: [
        'lucide:activity',
        'lucide:align-center',
        'lucide:align-left',
        'lucide:align-right',
        'lucide:archive',
        'lucide:arrow-down',
        'lucide:arrow-down-to-line',
        'lucide:arrow-up',
        'lucide:arrow-up-to-line',
        'lucide:at-sign',
        'lucide:award',
        'lucide:bold',
        'lucide:book-open',
        'lucide:building-2',
        'lucide:calendar',
        'lucide:calendar-range',
        'lucide:check',
        'lucide:chevron-down',
        'lucide:chevron-right',
        'lucide:circle-alert',
        'lucide:circle-check',
        'lucide:circle-help',
        'lucide:circle-x',
        'lucide:clipboard-check',
        'lucide:clipboard-clock',
        'lucide:clock',
        'lucide:clock-3',
        'lucide:copy',
        'lucide:database',
        'lucide:download',
        'lucide:ellipsis-vertical',
        'lucide:external-link',
        'lucide:eye',
        'lucide:eye-off',
        'lucide:file-check',
        'lucide:file-check-2',
        'lucide:file-plus',
        'lucide:file-spreadsheet',
        'lucide:file-text',
        'lucide:file-up',
        'lucide:file-x',
        'lucide:filter',
        'lucide:fingerprint',
        'lucide:flask-conical',
        'lucide:graduation-cap',
        'lucide:image',
        'lucide:info',
        'lucide:italic',
        'lucide:key-round',
        'lucide:layers',
        'lucide:layout-dashboard',
        'lucide:layout-template',
        'lucide:life-buoy',
        'lucide:link-2-off',
        'lucide:loader-circle',
        'lucide:lock-keyhole',
        'lucide:log-in',
        'lucide:log-out',
        'lucide:mail',
        'lucide:mail-check',
        'lucide:mail-warning',
        'lucide:map',
        'lucide:map-pin',
        'lucide:menu',
        'lucide:minus',
        'lucide:moon',
        'lucide:move',
        'lucide:palette',
        'lucide:pencil',
        'lucide:pencil-line',
        'lucide:plus',
        'lucide:printer',
        'lucide:refresh-cw',
        'lucide:rotate-ccw',
        'lucide:save',
        'lucide:school',
        'lucide:search',
        'lucide:send',
        'lucide:server',
        'lucide:settings',
        'lucide:shapes',
        'lucide:shield-alert',
        'lucide:shield-check',
        'lucide:sliders',
        'lucide:sparkles',
        'lucide:tag',
        'lucide:square',
        'lucide:star',
        'lucide:sun',
        'lucide:table',
        'lucide:trash-2',
        'lucide:triangle-alert',
        'lucide:type',
        'lucide:underline',
        'lucide:upload',
        'lucide:user',
        'lucide:user-plus',
        'lucide:users',
        'lucide:x'
      ]
    }
  },
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxtjs/i18n', '@nuxt/eslint'],
  nitro: {
    devProxy: {
      '/api/v2': {
        changeOrigin: true,
        target: 'http://127.0.0.1:8081/api/v2'
      }
    },
    preset: 'node-server'
  },
  runtimeConfig: {
    apiInternalBaseUrl:
      process.env.API_INTERNAL_BASE_URL ?? 'http://127.0.0.1:8081/api/v2',
    public: {
      apiBaseUrl: process.env.NUXT_PUBLIC_API_BASE_URL ?? '/api/v2',
      appEnvironment: resolvePublicAppEnvironment(
        process.env.NUXT_PUBLIC_APP_ENVIRONMENT,
        process.env.NODE_ENV
      )
    }
  },
  typescript: {
    strict: true,
    // Kept as a separate `nuxt typecheck` gate because Nuxt's in-build checker
    // currently passes incompatible CLI arguments to TypeScript 6.
    typeCheck: false
  }
})
