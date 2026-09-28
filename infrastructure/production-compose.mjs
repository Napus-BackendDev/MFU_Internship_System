import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  validateProductionImageReferences,
  verifyProductionImageSignatures
} from './validate-production-images.mjs'

const productionComposeActions = {
  config: ['config', '--quiet'],
  pull: ['pull'],
  up: ['up', '-d', '--no-build'],
  ps: ['ps']
}

export function resolveProductionComposeCommand(action, environment) {
  const validationErrors = validateProductionImageReferences(environment)
  if (validationErrors.length > 0) {
    return { error: validationErrors.join('\n') }
  }

  if (!Object.hasOwn(productionComposeActions, action)) {
    return { error: 'Expected one of: config, pull, up, ps' }
  }
  const actionArgs = productionComposeActions[action]

  return {
    args: [
      'compose',
      '--env-file',
      '.env.production',
      '-f',
      'infrastructure/compose.production.yaml',
      ...actionArgs
    ]
  }
}

export function runProductionComposeAction(
  action,
  environment,
  runCommand = spawnSync
) {
  const command = resolveProductionComposeCommand(action, environment)
  if (command.error) return command

  if (action === 'pull' || action === 'up') {
    const verification = verifyProductionImageSignatures(
      environment,
      runCommand
    )
    if (!verification.verified) return { error: verification.error }
  }

  const result = runCommand('docker', command.args, { stdio: 'inherit' })
  if (result.error) return { error: 'Could not start Docker Compose.' }
  return { status: result.status ?? 1 }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = runProductionComposeAction(process.argv[2], process.env)
  if (result.error) {
    process.stderr.write(`${result.error}\n`)
    process.exitCode = 1
  } else {
    process.exitCode = result.status
  }
}
