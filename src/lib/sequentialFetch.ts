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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries a single async call before giving up, with a backoff delay between
 * attempts. A lone transient network/timeout blip — or, for the HubSpot
 * function specifically, a rate-limited response that comes back as a
 * successful-but-empty result instead of an error — would otherwise silently
 * drop that brand's numbers from the total. `isBad` lets the caller flag a
 * *resolved* value as a failure worth retrying (not just thrown exceptions),
 * since the shared hubspot-data function returns HTTP 200 with zeroed stats
 * when its internal HubSpot API calls get rate-limited.
 */
export async function withRetry<R>(
  fn: () => Promise<R>,
  options: { retries?: number; delayMs?: number; isBad?: (result: R) => boolean } = {},
): Promise<R> {
  const { retries = 2, delayMs = 2500, isBad } = options;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const result = await fn();
      if (isBad?.(result) && attempt < retries) {
        attempt++;
        await sleep(delayMs);
        continue;
      }
      return result;
    } catch (err) {
      if (attempt >= retries) throw err;
      attempt++;
      await sleep(delayMs);
    }
  }
}
