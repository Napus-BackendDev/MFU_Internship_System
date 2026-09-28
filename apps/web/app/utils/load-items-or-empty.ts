interface ItemsResponse<T> {
  readonly items: T[]
}

export async function loadItemsOrEmpty<T>(
  load: () => Promise<ItemsResponse<T>>,
  onError: () => void
): Promise<ItemsResponse<T>> {
  try {
    return await load()
  } catch {
    onError()
    return { items: [] }
  }
}
