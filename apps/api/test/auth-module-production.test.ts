import 'reflect-metadata'

import { afterEach, describe, expect, it, vi } from 'vitest'

type ControllerType = { readonly name: string }

async function registeredControllersFor(
  nodeEnvironment: string
): Promise<ControllerType[]> {
  vi.stubEnv('NODE_ENV', nodeEnvironment)
  vi.resetModules()

  const { AuthModule } = await import('../src/auth/auth.module.js')
  return Reflect.getMetadata('controllers', AuthModule) as ControllerType[]
}

describe('authentication controller registration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('does not register development login in Production', async () => {
    const controllers = await registeredControllersFor('production')

    expect(controllers.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['AuthController', 'UsersController'])
    )
    expect(controllers.map(({ name }) => name)).not.toContain(
      'DevAuthController'
    )
  })

  it('registers development login outside Production', async () => {
    const controllers = await registeredControllersFor('development')

    expect(controllers.map(({ name }) => name)).toContain('DevAuthController')
  })
})
