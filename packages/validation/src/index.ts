import { ROLE_KEYS } from '@internship/shared-types'
import { z } from 'zod'

export const roleKeySchema = z.enum(ROLE_KEYS)

export const healthStatusSchema = z.object({
  service: z.enum(['api', 'web', 'worker']),
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
  version: z.string().min(1)
})
