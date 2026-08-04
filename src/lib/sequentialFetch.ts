/**
 * Runs async tasks one at a time (not in parallel).
 *
 * The HubSpot edge function shares one HubSpot API token across all ABG
 * brands; firing many hubspot-data requests in parallel (e.g. "Multiple
 * Brands" with many brands selected) trips HubSpot's rate limit and the
 * function silently returns zeroed-out stats instead of erroring. Fetching
 * serially avoids that entirely — slower, but the numbers are correct.
 */
export async function sequentialMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  onItemDone?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await fn(item));
    onItemDone?.(results.length, items.length);
  }
  return results;
}

/**
 * Retries a single async call once (by default) before giving up. A lone
 * transient network/timeout blip during a long serial multi-brand fetch
 * would otherwise silently drop that brand's numbers from the total.
 */
export async function withRetry<R>(fn: () => Promise<R>, retries = 1): Promise<R> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;
    }
  }
}
