import type { Permission } from '@internship/shared-types'
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import type { AuthenticatedRequest } from '../common/http.js'
import { readCookie } from '../common/http.js'
import {
  ANY_PERMISSION,
  AUTHENTICATED_ROUTE,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS
} from './auth.decorators.js'
import { roleHasRoutePermission } from './permission-map.js'
import { TokenService } from './token.service.js'
import { SessionService } from './session.service.js'

@Injectable()
export class AccessGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass()
    ])
    if (isPublic) return true

    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_ROUTE,
      [context.getHandler(), context.getClass()]
    )
    const permissions =
      this.reflector.getAllAndOverride<readonly Permission[]>(
        REQUIRED_PERMISSIONS,
        [context.getHandler(), context.getClass()]
      ) ?? []
    const anyPermissions =
      this.reflector.getAllAndOverride<readonly Permission[]>(ANY_PERMISSION, [
        context.getHandler(),
        context.getClass()
      ]) ?? []
    const hasPermissionRequirements =
      permissions.length > 0 || anyPermissions.length > 0

    if (!authenticatedOnly && !hasPermissionRequirements) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authorization = request.headers.authorization
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : readCookie(request, 'its_access')

    if (!token) {
      throw new UnauthorizedException({ code: 'AUTHENTICATION_REQUIRED' })
    }

    const verified = await this.tokenService.verifyAccessToken(token)
    const actor = await this.sessionService.assertAccessTokenCurrent(
      verified.sessionId,
      verified.actor
    )
    const rolesGrantingRoute = actor.roles.filter(
      (role) =>
        permissions.every((permission) =>
          roleHasRoutePermission(actor, role, permission)
        ) &&
        (anyPermissions.length === 0 ||
          anyPermissions.some((permission) =>
            roleHasRoutePermission(actor, role, permission)
          ))
    )
    if (hasPermissionRequirements && rolesGrantingRoute.length === 0) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED' })
    }

    if (hasPermissionRequirements && actor.roleScopes) {
      const authorizedRoles = new Set(rolesGrantingRoute)
      request.actor = {
        ...actor,
        roles: rolesGrantingRoute,
        roleScopes: actor.roleScopes.filter((scope) =>
          authorizedRoles.has(scope.role)
        )
      }
    } else if (hasPermissionRequirements) {
      request.actor = { ...actor, roles: rolesGrantingRoute }
    } else {
      request.actor = actor
    }
    return true
  }
}
