export const HTTP_LOG_REDACT_PATHS = [
  'req.url',
  'req.query',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers.set-cookie',
  '*.token',
  '*.accessToken',
  '*.password',
  '*.passwordCiphertext',
  '*.passwordIv',
  '*.passwordAuthTag'
] as const
