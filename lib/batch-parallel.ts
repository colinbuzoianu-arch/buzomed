/**
 * Runs `fn` over `items` in fixed-size concurrent batches, using
 * `Promise.allSettled` per batch so one item's rejection never blocks or
 * fails the rest — matches the per-item error isolation these call sites
 * already had before being parallelized (see performance audit §9/D).
 *
 * Batches run one after another (not all at once), bounding how many
 * concurrent DB connections/outbound requests a single call can create —
 * important given the app's serverless connection pool is deliberately
 * thin (DATABASE_URL connection_limit=1 per instance).
 */
export async function runInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchResults = await Promise.allSettled(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}
