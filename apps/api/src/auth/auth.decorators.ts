import type { Permission } from '@internship/shared-types'
import { SetMetadata } from '@nestjs/common'

export const PUBLIC_ROUTE = Symbol('public-route')
export const REQUIRED_PERMISSIONS = Symbol('required-permissions')
export const ANY_PERMISSION = Symbol('any-permission')
export const AUTHENTICATED_ROUTE = Symbol('authenticated-route')

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PUBLIC_ROUTE, true)

export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHENTICATED_ROUTE, true)

export const RequirePermissions = (
  ...permissions: readonly Permission[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions)

export const RequireAnyPermission = (
  ...permissions: readonly Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(ANY_PERMISSION, permissions)
