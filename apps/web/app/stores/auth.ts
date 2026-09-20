import type { AuthenticatedActor, RoleKey } from '@internship/shared-types'

export const useAuthStore = defineStore('auth', () => {
  const actor = ref<AuthenticatedActor | null>(null)
  const loaded = ref(false)
  const api = useApi()

  async function load(): Promise<void> {
    try {
      let result: { actor: AuthenticatedActor }
      try {
        result = await api<{ actor: AuthenticatedActor }>('/auth/me')
      } catch {
        await api('/auth/refresh', { method: 'POST' })
        result = await api<{ actor: AuthenticatedActor }>('/auth/me')
      }
      actor.value = result.actor
    } finally {
      loaded.value = true
    }
  }

  async function devLogin(
    role: RoleKey = 'systemAdmin',
    options?: {
      displayName?: string
      email?: string
      schoolIds?: string[]
      programIds?: string[]
      studentId?: string
    }
  ): Promise<void> {
    const result = await api<{ actor: AuthenticatedActor }>('/auth/dev/login', {
      method: 'POST',
      body: {
        role,
        ...(options?.displayName ? { displayName: options.displayName } : {}),
        ...(options?.email ? { email: options.email } : {}),
        ...(options?.schoolIds ? { schoolIds: options.schoolIds } : {}),
        ...(options?.programIds ? { programIds: options.programIds } : {}),
        ...(options?.studentId ? { studentId: options.studentId } : {})
      }
    })
    actor.value = result.actor
    loaded.value = true
  }

  async function exchangeInvitation(token: string): Promise<void> {
    const result = await api<{ actor: AuthenticatedActor }>(
      '/public/invitations/exchange',
      { method: 'POST', body: { token } }
    )
    actor.value = result.actor
    loaded.value = true
  }

  async function verifyPin(pin: string): Promise<{
    actor: AuthenticatedActor
    assignmentId: string
  }> {
    const result = await api<{
      actor: AuthenticatedActor
      assignmentId: string
    }>('/public/evaluations/verify-pin', {
      method: 'POST',
      body: { pin }
    })
    actor.value = result.actor
    loaded.value = true
    return result
  }

  async function logout(): Promise<void> {
    await api('/auth/logout', { method: 'POST' })
    actor.value = null
    loaded.value = true
  }

  return {
    actor,
    loaded,
    load,
    devLogin,
    exchangeInvitation,
    verifyPin,
    logout
  }
})
