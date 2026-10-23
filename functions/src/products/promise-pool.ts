export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item);
    }
  }

  const workers = Math.min(Math.max(limit, 1), items.length);
  if (workers === 0) return [];
  await Promise.all(Array.from({ length: workers }, () => run()));
  return results;
}
