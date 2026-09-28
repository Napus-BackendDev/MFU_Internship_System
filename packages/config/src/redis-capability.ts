export interface RedisHealthClient {
  info(section: string): Promise<string>
  ping(): Promise<string>
}

export function supportsBullMqRedisVersion(info: string): boolean {
  const match = /^redis_version:(\d+)\./mu.exec(info)
  const major = match?.[1] ? Number.parseInt(match[1], 10) : 0
  return major >= 5
}

export async function isBullMqRedisReady(
  redis: RedisHealthClient
): Promise<boolean> {
  try {
    if ((await redis.ping()) !== 'PONG') return false
    return supportsBullMqRedisVersion(await redis.info('server'))
  } catch {
    return false
  }
}
