import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import {
  ANY_PERMISSION,
  REQUIRED_PERMISSIONS
} from '../src/auth/auth.decorators.js'
import { GeneralSettingsController } from '../src/system-settings/general-settings.controller.js'

describe('general system settings authorization contract', () => {
  it('restricts global settings mutations to system.config.manage', () => {
    const methods = [
      'createProvince',
      'updateProvince',
      'deleteProvince',
      'resetProvinces',
      'updateGeneralConfig'
    ] as const

    for (const method of methods) {
      const descriptor = Object.getOwnPropertyDescriptor(
        GeneralSettingsController.prototype,
        method
      )
      expect(descriptor, `${method} handler`).toBeDefined()
      if (!descriptor) continue
      const handler: object = descriptor.value as object

      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS, handler),
        `${method} required permissions`
      ).toEqual(['system.config.manage'])
      expect(
        Reflect.getMetadata(ANY_PERMISSION, handler),
        `${method} any-permission override`
      ).toBeUndefined()
    }
  })
})
