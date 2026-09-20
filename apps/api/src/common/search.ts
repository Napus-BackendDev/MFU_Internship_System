export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function boundedSearch(input: string, maxLength = 100): string {
  return escapeRegex(input.trim().slice(0, maxLength))
}
