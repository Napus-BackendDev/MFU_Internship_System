import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const productionImages = Object.freeze({
  API_IMAGE: 'ghcr.io/napus-backenddev/mfu-internship-system-api',
  WORKER_IMAGE: 'ghcr.io/napus-backenddev/mfu-internship-system-worker',
  WEB_IMAGE: 'ghcr.io/napus-backenddev/mfu-internship-system-web'
})
export const productionImageVariables = Object.keys(productionImages)
export const productionImageSignerIdentity =
  'https://github.com/Napus-BackendDev/MFU_Internship_System/.github/workflows/publish-images.yaml@refs/heads/main'
export const productionImageSignerIssuer =
  'https://token.actions.githubusercontent.com'

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function validateProductionImageReferences(environment) {
  return Object.entries(productionImages).flatMap(([variable, repository]) => {
    const value = environment[variable]
    const digestReference = new RegExp(
      `^${escapeRegExp(repository)}@sha256:[a-f0-9]{64}$`,
      'u'
    )
    return typeof value === 'string' && digestReference.test(value)
      ? []
      : [
          `${variable} must use the approved GHCR repository and a sha256 digest`
        ]
  })
}

export function verifyProductionImageSignatures(
  environment,
  runCommand = spawnSync
) {
  const validationErrors = validateProductionImageReferences(environment)
  if (validationErrors.length > 0) {
    return { verified: false, error: validationErrors.join('\n') }
  }

  for (const variable of productionImageVariables) {
    const result = runCommand(
      'cosign',
      [
        'verify',
        '--certificate-identity',
        productionImageSignerIdentity,
        '--certificate-oidc-issuer',
        productionImageSignerIssuer,
        environment[variable]
      ],
      { stdio: 'ignore' }
    )
    if (result.error || result.status !== 0) {
      return {
        verified: false,
        error: `Signature verification failed for ${variable}; refusing Production image operation.`
      }
    }
  }

  return { verified: true }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = validateProductionImageReferences(process.env)
  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write('All production image references are digest-pinned.\n')
  }
}
