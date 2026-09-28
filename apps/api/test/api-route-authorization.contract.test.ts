import 'reflect-metadata'

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import type {
  AuthenticatedActor,
  Permission,
  RoleKey
} from '@internship/shared-types'
import { ROLE_KEYS } from '@internship/shared-types'
import { RequestMethod, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AcademicModule } from '../src/academic/academic.module.js'
import { AuditModule } from '../src/audit/audit.module.js'
import {
  ANY_PERMISSION,
  AUTHENTICATED_ROUTE,
  PUBLIC_ROUTE,
  REQUIRED_PERMISSIONS
} from '../src/auth/auth.decorators.js'
import { AuthModule } from '../src/auth/auth.module.js'
import { CorrespondenceModule } from '../src/correspondence/correspondence.module.js'
import { DocumentsModule } from '../src/documents/documents.module.js'
import { EvaluationsModule } from '../src/evaluations/evaluations.module.js'
import { HealthController } from '../src/health.controller.js'
import { MembersModule } from '../src/members/members.module.js'
import { ReportsModule } from '../src/reports/reports.module.js'
import { GeneralSettingsModule } from '../src/system-settings/general-settings.module.js'
import { SmtpSettingsModule } from '../src/system-settings/smtp-settings.module.js'
import { AccessGuard } from '../src/auth/access.guard.js'
import { ROLE_PERMISSIONS } from '../src/auth/permission-map.js'

const API_MODULES = [
  AcademicModule,
  AuditModule,
  AuthModule,
  CorrespondenceModule,
  DocumentsModule,
  EvaluationsModule,
  MembersModule,
  ReportsModule,
  GeneralSettingsModule,
  SmtpSettingsModule
]

const ALLOWED_PUBLIC_ROUTES = new Set([
  'AuthController.callback',
  'AuthController.login',
  'AuthController.refresh',
  'CorrespondenceController.exchangeInvitation',
  'CorrespondenceController.verifyPin',
  'HealthController.getHealth',
  'HealthController.getLiveness',
  'HealthController.getReadiness',
  ...(process.env.NODE_ENV === 'production' ? [] : ['DevAuthController.login'])
])
const PUBLIC_COOKIE_AUTHENTICATED_ROUTES = new Set(['AuthController.refresh'])

const AUTHENTICATED_MUTATIONS = new Set(['AuthController.logout'])
const MUTATING_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PUT,
  RequestMethod.PATCH,
  RequestMethod.DELETE
])
const OPENAPI_PATH = fileURLToPath(
  new URL('../../../docs/api/openapi.yaml', import.meta.url)
)

function findOpenApiOperation(
  document: string,
  path: string,
  method: string
): string | undefined {
  const lines = document.split(/\r?\n/)
  const normalizePath = (value: string): string =>
    value.replace(/\{[^}]+\}/g, '{}')
  const pathIndex = lines.findIndex(
    (line) =>
      line.startsWith('  /') &&
      line.endsWith(':') &&
      normalizePath(line.slice(2, -1)) === normalizePath(path)
  )
  if (pathIndex < 0) return undefined

  const nextPathIndex = lines.findIndex(
    (line, index) => index > pathIndex && /^\x20{2}\/[^:]+:$/.test(line)
  )
  const pathBlock = lines.slice(
    pathIndex + 1,
    nextPathIndex < 0 ? undefined : nextPathIndex
  )
  const methodIndex = pathBlock.indexOf(`    ${method}:`)
  if (methodIndex < 0) return undefined

  const nextMethodIndex = pathBlock.findIndex(
    (line, index) =>
      index > methodIndex &&
      /^\x20{4}(?:get|post|put|patch|delete|options|head|trace):$/.test(line)
  )
  return pathBlock
    .slice(methodIndex, nextMethodIndex < 0 ? undefined : nextMethodIndex)
    .join('\n')
}

function routePathVariants(path: unknown): readonly string[] {
  if (path === undefined) return ['']
  const values = Array.isArray(path) ? path : [path]
  return values.filter((value): value is string => typeof value === 'string')
}

function toOpenApiPath(controllerPath: string, methodPath: string): string {
  const joined = [controllerPath, methodPath]
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
  return `/${joined.replace(/:([A-Za-z0-9_]+)/g, '{}')}`
}

type ControllerType = {
  readonly name: string
  readonly prototype: object
}

function metadata<T>(key: string | symbol, target: object): T | undefined {
  return Reflect.getMetadata(key, target) as T | undefined
}

function controllerRoutes(): readonly ControllerType[] {
  const featureControllers = API_MODULES.flatMap(
    (module) => metadata<readonly ControllerType[]>('controllers', module) ?? []
  )
  return [...new Set([HealthController, ...featureControllers])]
}

function actorForRole(role: RoleKey): AuthenticatedActor {
  const tenant = role === 'systemAdmin' || role === 'internshipStaff'
  const schoolIds = tenant ? [] : ['school-in-scope']
  const programIds = tenant ? [] : ['program-in-scope']
  const scope: AuthenticatedActor['scope'] = {
    tenant,
    schoolIds,
    programIds,
    ...(role === 'student' ? { studentId: 'student-in-scope' } : {}),
    ...(role === 'evaluator' ? { assignmentId: 'assignment-in-scope' } : {})
  }

  return {
    id: `matrix:${role}`,
    email: `${role}@example.test`,
    displayName: role,
    roles: [role],
    scope,
    roleScopes: [{ role, tenant, schoolIds, programIds }]
  }
}

function routeGuard(
  controller: ControllerType,
  handler: object,
  actor: AuthenticatedActor,
  request: { headers: { authorization?: string }; actor?: AuthenticatedActor }
): { context: ExecutionContext; guard: AccessGuard } {
  const context = {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext

  const guard = new AccessGuard(
    new Reflector(),
    {
      verifyAccessToken: vi.fn().mockResolvedValue({
        sessionId: 'matrix-session'
      })
    } as never,
    {
      assertAccessTokenCurrent: vi.fn().mockResolvedValue(actor)
    } as never
  )

  return { context, guard }
}

function permissionAllowsRole(
  actor: AuthenticatedActor,
  role: RoleKey,
  permission: Permission
): boolean {
  if (!ROLE_PERMISSIONS[role].includes(permission)) return false
  if (
    (permission === 'documentTemplates.manage' ||
      permission === 'documentTemplates.publish') &&
    role === 'internshipStaff'
  ) {
    return (
      actor.roleScopes?.some((scope) => scope.role === role && scope.tenant) ===
      true
    )
  }
  return true
}

function getPolicy<T>(
  key: symbol,
  handler: object,
  controller: object
): T | undefined {
  return (
    (Reflect.getMetadata(key, handler) as T | undefined) ??
    (Reflect.getMetadata(key, controller) as T | undefined)
  )
}

describe('API route authorization contract', () => {
  const routes = controllerRoutes().flatMap((controller) => {
    const prototype = (controller as { prototype: object }).prototype
    return Object.getOwnPropertyNames(prototype).flatMap((methodName) => {
      const handler = (prototype as Record<string, unknown>)[methodName]
      if (typeof handler !== 'function') return []
      const path = metadata<unknown>('path', handler)
      const method = metadata<RequestMethod>('method', handler)
      if (path === undefined || method === undefined) return []
      return [{ controller, handler, methodName, method }]
    })
  })

  it('requires an explicit public, authenticated, or permission policy on every API route', () => {
    expect(routes.length).toBeGreaterThan(0)

    for (const route of routes) {
      const routeName = `${route.controller.name}.${route.methodName}`
      const isPublic =
        getPolicy<boolean>(PUBLIC_ROUTE, route.handler, route.controller) ===
        true
      const authenticated =
        getPolicy<boolean>(
          AUTHENTICATED_ROUTE,
          route.handler,
          route.controller
        ) === true
      const permissions =
        getPolicy<readonly string[]>(
          REQUIRED_PERMISSIONS,
          route.handler,
          route.controller
        ) ?? []
      const anyPermissions =
        getPolicy<readonly string[]>(
          ANY_PERMISSION,
          route.handler,
          route.controller
        ) ?? []

      expect(
        isPublic ||
          authenticated ||
          permissions.length > 0 ||
          anyPermissions.length > 0,
        `${routeName} must declare an access policy`
      ).toBe(true)

      if (isPublic) {
        expect(ALLOWED_PUBLIC_ROUTES.has(routeName), routeName).toBe(true)
        expect(
          authenticated,
          `${routeName} cannot combine public and authenticated policy`
        ).toBe(false)
        expect(
          permissions,
          `${routeName} cannot combine public and permission policy`
        ).toEqual([])
        expect(
          anyPermissions,
          `${routeName} cannot combine public and permission policy`
        ).toEqual([])
      }

      if (MUTATING_METHODS.has(route.method) && !isPublic) {
        const permissionProtected =
          permissions.length > 0 || anyPermissions.length > 0
        expect(
          permissionProtected || AUTHENTICATED_MUTATIONS.has(routeName),
          `${routeName} mutation must require permission`
        ).toBe(true)
      }
    }
  })

  it('keeps the public API surface equal to the explicit allowlist', () => {
    const publicRoutes = routes
      .filter(
        ({ controller, handler }) =>
          getPolicy<boolean>(PUBLIC_ROUTE, handler, controller) === true
      )
      .map(({ controller, methodName }) => `${controller.name}.${methodName}`)
      .sort()

    expect(publicRoutes).toEqual([...ALLOWED_PUBLIC_ROUTES].sort())
  })

  it('requires a current session on every non-public route', async () => {
    const protectedRoutes = routes.filter(
      ({ controller, handler }) =>
        getPolicy<boolean>(PUBLIC_ROUTE, handler, controller) !== true
    )

    await Promise.all(
      protectedRoutes.map(async (route) => {
        const actor = actorForRole('student')
        const request: {
          headers: { authorization?: string }
          actor?: AuthenticatedActor
        } = { headers: {} }
        const guarded = routeGuard(
          route.controller,
          route.handler,
          actor,
          request
        )

        await expect(
          guarded.guard.canActivate(guarded.context),
          `${route.controller.name}.${route.methodName}`
        ).rejects.toMatchObject({ status: 401 })
      })
    )
  })

  it('enforces every runtime route against the six-role permission matrix', async () => {
    const protectedRoutes = routes.filter(
      ({ controller, handler }) =>
        getPolicy<boolean>(PUBLIC_ROUTE, handler, controller) !== true
    )

    const cases = protectedRoutes.flatMap((route) =>
      ROLE_KEYS.map((role) => ({ route, role }))
    )

    await Promise.all(
      cases.map(async ({ route, role }) => {
        const actor = actorForRole(role)
        const permissions =
          getPolicy<readonly string[]>(
            REQUIRED_PERMISSIONS,
            route.handler,
            route.controller
          ) ?? []
        const anyPermissions =
          getPolicy<readonly string[]>(
            ANY_PERMISSION,
            route.handler,
            route.controller
          ) ?? []
        const authenticatedOnly =
          getPolicy<boolean>(
            AUTHENTICATED_ROUTE,
            route.handler,
            route.controller
          ) === true
        const hasPermissionRequirements =
          permissions.length > 0 || anyPermissions.length > 0
        const expected = hasPermissionRequirements
          ? permissions.every((permission) =>
              permissionAllowsRole(actor, role, permission as Permission)
            ) &&
            (anyPermissions.length === 0 ||
              anyPermissions.some((permission) =>
                permissionAllowsRole(actor, role, permission as Permission)
              ))
          : authenticatedOnly
        const request: {
          headers: { authorization?: string }
          actor?: AuthenticatedActor
        } = { headers: { authorization: 'Bearer matrix-access-token' } }
        const guarded = routeGuard(
          route.controller,
          route.handler,
          actor,
          request
        )
        const routeName = `${route.controller.name}.${route.methodName}`

        if (expected) {
          await expect(
            guarded.guard.canActivate(guarded.context),
            `${role} should access ${routeName}`
          ).resolves.toBe(true)
          expect(
            request.actor?.roles,
            `${role} actor for ${routeName}`
          ).toEqual([role])
        } else {
          await expect(
            guarded.guard.canActivate(guarded.context),
            `${role} must not access ${routeName}`
          ).rejects.toMatchObject({ status: 403 })
          expect(
            request.actor,
            `${role} actor for ${routeName}`
          ).toBeUndefined()
        }
      })
    )
  })

  it('documents runtime system-template and health alias routes with matching permissions', () => {
    const document = readFileSync(OPENAPI_PATH, 'utf8')
    const documentedRoutes = [
      {
        method: 'get',
        path: '/health',
        operationId: 'getHealth',
        permission: undefined
      },
      {
        method: 'get',
        path: '/email-templates/system',
        operationId: 'getSystemEmailTemplates',
        permission: 'emailTemplates.read'
      },
      {
        method: 'put',
        path: '/email-templates/system/{code}',
        operationId: 'updateSystemEmailTemplate',
        permission: 'emailTemplates.manage'
      },
      {
        method: 'post',
        path: '/email-templates/system/{code}/reset',
        operationId: 'resetSystemEmailTemplate',
        permission: 'emailTemplates.manage'
      }
    ] as const

    for (const route of documentedRoutes) {
      const operation = findOpenApiOperation(document, route.path, route.method)
      expect(
        operation,
        `${route.method.toUpperCase()} ${route.path} must be documented`
      ).toBeDefined()
      expect(operation).toContain(`operationId: ${route.operationId}`)

      if (route.permission) {
        expect(operation).toContain(`x-permissions: [${route.permission}]`)
      } else {
        expect(operation).toContain('security: []')
      }
    }
  })

  it('documents every non-development runtime route and HTTP method', () => {
    const document = readFileSync(OPENAPI_PATH, 'utf8')
    const undocumentedRoutes: string[] = []
    const methodNames = new Map<RequestMethod, string>([
      [RequestMethod.GET, 'get'],
      [RequestMethod.POST, 'post'],
      [RequestMethod.PUT, 'put'],
      [RequestMethod.PATCH, 'patch'],
      [RequestMethod.DELETE, 'delete']
    ])

    for (const route of routes) {
      if (route.controller.name === 'DevAuthController') continue

      const method = methodNames.get(route.method)
      if (!method) {
        undocumentedRoutes.push(
          `${route.controller.name}.${route.methodName}: unsupported HTTP method`
        )
        continue
      }

      const controllerPaths = routePathVariants(
        metadata('path', route.controller)
      )
      const methodPaths = routePathVariants(metadata('path', route.handler))

      for (const controllerPath of controllerPaths) {
        for (const methodPath of methodPaths) {
          const path = toOpenApiPath(controllerPath, methodPath)
          const operation = findOpenApiOperation(document, path, method)
          if (!operation) {
            undocumentedRoutes.push(
              `${method.toUpperCase()} ${path} (${route.controller.name}.${route.methodName})`
            )
            continue
          }

          const requiredPermissions =
            getPolicy<readonly string[]>(
              REQUIRED_PERMISSIONS,
              route.handler,
              route.controller
            ) ?? []
          const anyPermissions =
            getPolicy<readonly string[]>(
              ANY_PERMISSION,
              route.handler,
              route.controller
            ) ?? []
          const expectedPermissions = [
            ...requiredPermissions,
            ...anyPermissions
          ].sort()

          if (expectedPermissions.length > 0) {
            const declaredPermissions = operation.match(
              /^\x20{6}x-permissions:\s*\[([^\]]*)\]$/m
            )?.[1]
            const parsedPermissions = declaredPermissions
              ?.split(',')
              .map((permission) => permission.trim())
              .filter(Boolean)
              .sort()
            if (
              JSON.stringify(parsedPermissions) !==
              JSON.stringify(expectedPermissions)
            ) {
              undocumentedRoutes.push(
                `${method.toUpperCase()} ${path} (${route.controller.name}.${route.methodName}): permission list mismatch`
              )
            }

            const declaredMode = operation.match(
              /^\x20{6}x-permission-mode:\s*(all|any)$/m
            )?.[1]
            const expectedMode = anyPermissions.length > 0 ? 'any' : 'all'
            if (declaredMode !== undefined && declaredMode !== expectedMode) {
              undocumentedRoutes.push(
                `${method.toUpperCase()} ${path} (${route.controller.name}.${route.methodName}): permission mode mismatch`
              )
            }
            if (expectedMode === 'any' && declaredMode !== 'any') {
              undocumentedRoutes.push(
                `${method.toUpperCase()} ${path} (${route.controller.name}.${route.methodName}): expected any permission mode`
              )
            }
          } else if (
            getPolicy<boolean>(PUBLIC_ROUTE, route.handler, route.controller) &&
            !PUBLIC_COOKIE_AUTHENTICATED_ROUTES.has(
              `${route.controller.name}.${route.methodName}`
            ) &&
            !operation.includes('security: []')
          ) {
            undocumentedRoutes.push(
              `${method.toUpperCase()} ${path} (${route.controller.name}.${route.methodName}): public route must disable OpenAPI security`
            )
          }
        }
      }
    }

    expect(undocumentedRoutes).toEqual([])
  })
})
