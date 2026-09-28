const evaluationPath = '/evaluate'

export interface EvaluationEntryCredentials {
  readonly token?: string
  readonly pin?: string
  readonly assignment?: string
  readonly hasCredential: boolean
}

export function buildEvaluationPinPath(pin: string): string {
  const fragment = new URLSearchParams({ pin })
  return `${evaluationPath}#${fragment.toString()}`
}

export function readEvaluationEntryCredentials(
  search: string,
  hash: string
): EvaluationEntryCredentials {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/u, ''))
  const readSingle = (name: string): string | undefined => {
    const values = [...query.getAll(name), ...fragment.getAll(name)]
    return values.length === 1 && values[0] ? values[0] : undefined
  }

  return {
    token: readSingle('token'),
    pin: readSingle('pin'),
    assignment: readSingle('assignment'),
    hasCredential:
      query.has('token') ||
      query.has('pin') ||
      fragment.has('token') ||
      fragment.has('pin')
  }
}
