export default defineNuxtRouteMiddleware(async () => {
  const auth = useAuthStore()
  if (!auth.loaded) {
    try {
      await auth.load()
    } catch {
      return navigateTo('/login')
    }
  }
  if (!auth.actor) return navigateTo('/login')
})
