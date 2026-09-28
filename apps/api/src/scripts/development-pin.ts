import { generatePin, hashInvitationPin } from '../correspondence/pin.js'

export interface DevelopmentPinCredential {
  readonly accessPinHash: string
}

export function createDevelopmentPinCredential(
  pepper: string,
  existingHash?: string
): DevelopmentPinCredential {
  const accessPinHash =
    existingHash && /^(?:[a-f0-9]{64}|v2:[a-f0-9]{64})$/u.test(existingHash)
      ? existingHash
      : hashInvitationPin(generatePin(), pepper)

  return { accessPinHash }
}
