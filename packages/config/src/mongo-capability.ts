export function supportsMongoTransactions(
  hello: Readonly<Record<string, unknown>>
): boolean {
  const isReplicaSet =
    typeof hello.setName === 'string' && hello.setName.length > 0
  const isShardedCluster = hello.msg === 'isdbgrid'
  const sessionTimeout = hello.logicalSessionTimeoutMinutes
  const maxWireVersion = hello.maxWireVersion

  if (
    (!isReplicaSet && !isShardedCluster) ||
    typeof sessionTimeout !== 'number' ||
    sessionTimeout <= 0 ||
    typeof maxWireVersion !== 'number'
  ) {
    return false
  }

  return maxWireVersion >= (isShardedCluster ? 8 : 7)
}
