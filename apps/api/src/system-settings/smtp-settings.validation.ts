import { z } from 'zod'

const smtpHost = z
  .string()
  .trim()
  .min(1, 'กรุณาระบุ SMTP host')
  .max(253)
  .regex(/^[a-zA-Z0-9.-]+$/, 'SMTP host ต้องเป็น hostname หรือ IP address')

const sender = z
  .string()
  .trim()
  .min(3, 'กรุณาระบุผู้ส่ง')
  .max(320)
  .refine(
    (value) =>
      /^[^<>()\s@]+@(?:localhost|[^<>()\s@]+\.[^<>()\s@]+)$/i.test(value) ||
      /^.{1,120}<[^<>()\s@]+@(?:localhost|[^<>()\s@]+\.[^<>()\s@]+)>$/i.test(
        value
      ),
    'ผู้ส่งต้องเป็นอีเมล หรือ ชื่อ <email@example.com>'
  )

export const smtpSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    host: smtpHost,
    port: z.number().int().min(1).max(65_535),
    secure: z.boolean(),
    username: z.string().trim().max(320).default(''),
    password: z.string().min(1).max(1024).optional(),
    clearPassword: z.boolean().default(false),
    from: sender,
    version: z.number().int().min(0)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.password && value.clearPassword) {
      context.addIssue({
        code: 'custom',
        message: 'ส่งรหัสผ่านใหม่และลบรหัสผ่านพร้อมกันไม่ได้',
        path: ['password']
      })
    }
  })

export const smtpTestInputSchema = z
  .object({ recipientEmail: z.string().trim().email().max(320) })
  .strict()

export type SmtpSettingsUpdateInput = z.infer<typeof smtpSettingsUpdateSchema>
