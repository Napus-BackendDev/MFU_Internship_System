import { createHmac, randomInt } from 'node:crypto'

export function normalizePin(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, '').toUpperCase()
}

export function hashPin(pin: string, secret: string): string {
  return createHmac('sha256', secret).update(normalizePin(pin)).digest('hex')
}

export function generatePin(): string {
  let pin = ''
  for (let index = 0; index < 16; index += 1) {
    pin += String(randomInt(0, 10))
  }
  return pin
}
