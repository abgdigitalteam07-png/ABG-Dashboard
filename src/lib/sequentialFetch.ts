/**
 * Runs async tasks one at a time (not in parallel).
 *
 * The HubSpot edge function shares one HubSpot API token across all ABG
 * brands; firing many hubspot-data requests in parallel (e.g. "Multiple
 * Brands" with many brands selected) trips HubSpot's rate limit and the
 * function silently returns zeroed-out stats instead of erroring. Fetching
 * serially avoids that entirely — slower, but the numbers are correct.
 */
export async function sequentialMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const item of items) {
    results.push(await fn(item));
  }
  return results;
}
