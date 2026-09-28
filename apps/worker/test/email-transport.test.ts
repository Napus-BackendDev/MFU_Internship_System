import type { AppEnvironment } from '@internship/config'
import { createServer, type Server, type Socket } from 'node:net'
import type { Logger } from 'pino'
import { afterEach, describe, expect, it } from 'vitest'

import { EmailProcessor } from '../src/runtime/email.processor.js'
import type { WorkerModels } from '../src/runtime/models.js'

interface SmtpConfiguration {
  readonly source: 'environment'
  readonly version: number
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly from: string
}

interface EmailProcessorTransportAccess {
  createTransport(configuration: SmtpConfiguration): {
    options: {
      readonly secure: boolean
      readonly requireTLS?: boolean
    }
  }
}

function createProcessor(
  nodeEnvironment: 'development' | 'production'
): EmailProcessorTransportAccess {
  return new EmailProcessor(
    {
      NODE_ENV: nodeEnvironment,
      MAIL_DELIVERY_MODE: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      AUTH_JWT_SECRET: 'test-only-signing-secret'
    } as AppEnvironment,
    {} as WorkerModels,
    {
      error: () => undefined,
      info: () => undefined,
      warn: () => undefined
    } as unknown as Logger
  ) as unknown as EmailProcessorTransportAccess
}

const startTlsConfiguration: SmtpConfiguration = {
  source: 'environment',
  version: 0,
  host: 'smtp.example.test',
  port: 587,
  secure: false,
  from: 'no-reply@example.test'
}

describe('SMTP transport encryption policy', () => {
  it('requires STARTTLS in Production but preserves local and implicit TLS modes', () => {
    const productionStartTls = createProcessor('production').createTransport(
      startTlsConfiguration
    )
    expect(productionStartTls.options).toMatchObject({
      secure: false,
      requireTLS: true
    })

    const productionImplicitTls = createProcessor('production').createTransport(
      {
        ...startTlsConfiguration,
        port: 465,
        secure: true
      }
    )
    expect(productionImplicitTls.options).toMatchObject({ secure: true })

    const developmentStartTls = createProcessor('development').createTransport(
      startTlsConfiguration
    )
    expect(developmentStartTls.options).toMatchObject({ secure: false })
  })
})

describe('SMTP capture transport integration', () => {
  let activeServer: Server | undefined
  const activeSockets = new Set<Socket>()

  afterEach(async () => {
    if (!activeServer?.listening) return
    for (const socket of activeSockets) socket.destroy()
    activeSockets.clear()
    await new Promise<void>((resolve, reject) =>
      activeServer!.close((error) => (error ? reject(error) : resolve()))
    )
    activeServer = undefined
  })

  it('sends a message over SMTP to a loopback-only capture server', async () => {
    const captured: {
      envelopeFrom: string
      recipients: string[]
      data: string
    } = {
      envelopeFrom: '',
      recipients: [],
      data: ''
    }

    activeServer = createServer((socket) => {
      activeSockets.add(socket)
      socket.once('close', () => activeSockets.delete(socket))
      let input = ''
      let readingMessage = false
      socket.write('220 internship-test.local ESMTP ready\r\n')

      socket.on('data', (chunk: Buffer) => {
        input += chunk.toString('utf8')

        while (true) {
          if (readingMessage) {
            const terminator = input.indexOf('\r\n.\r\n')
            if (terminator < 0) return
            captured.data = input.slice(0, terminator + 2)
            input = input.slice(terminator + 5)
            readingMessage = false
            socket.write('250 2.0.0 captured\r\n')
            continue
          }

          const lineEnd = input.indexOf('\r\n')
          if (lineEnd < 0) return
          const line = input.slice(0, lineEnd)
          input = input.slice(lineEnd + 2)
          const [command = ''] = line.split(' ', 1)

          if (command === 'EHLO' || command === 'HELO') {
            socket.write('250-internship-test.local\r\n250 SIZE 10485760\r\n')
          } else if (command === 'MAIL') {
            captured.envelopeFrom = line
            socket.write('250 2.1.0 sender accepted\r\n')
          } else if (command === 'RCPT') {
            captured.recipients.push(line)
            socket.write('250 2.1.5 recipient accepted\r\n')
          } else if (command === 'DATA') {
            readingMessage = true
            socket.write('354 end with <CRLF>.<CRLF>\r\n')
          } else if (command === 'QUIT') {
            socket.end('221 2.0.0 closing connection\r\n')
          } else {
            socket.write('250 2.0.0 ok\r\n')
          }
        }
      })
    })
    await new Promise<void>((resolve, reject) => {
      activeServer!.once('error', reject)
      activeServer!.listen(0, '127.0.0.1', resolve)
    })

    const address = activeServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('SMTP capture server did not bind to a TCP port')
    }

    const processor = createProcessor('development')
    const transport = processor.createTransport({
      source: 'environment',
      version: 0,
      host: '127.0.0.1',
      port: address.port,
      secure: false,
      from: 'no-reply@internship.test'
    }) as unknown as {
      sendMail: (message: {
        from: string
        to: string
        subject: string
        text: string
      }) => Promise<{ accepted: string[] }>
      close: () => void
    }

    try {
      await expect(
        transport.sendMail({
          from: 'no-reply@internship.test',
          to: 'evaluator@company.test',
          subject: 'SMTP capture integration',
          text: 'Captured locally; no real mail sent.'
        })
      ).resolves.toMatchObject({ accepted: ['evaluator@company.test'] })
    } finally {
      transport.close()
    }

    expect(captured.envelopeFrom).toContain('<no-reply@internship.test>')
    expect(captured.recipients).toEqual(['RCPT TO:<evaluator@company.test>'])
    expect(captured.data).toContain('Subject: SMTP capture integration')
    expect(captured.data).toContain('Captured locally; no real mail sent.')
  })
})
