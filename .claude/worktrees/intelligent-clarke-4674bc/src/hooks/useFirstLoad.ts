import { useRef } from "react";

/**
 * Returns `true` only while the component is loading for the very first time.
 * After the first successful load completes, always returns `false` — even if
 * `isLoading` goes true again (e.g. brand switch, date change).
 *
 * This means the full-page loader shows exactly once per tab mount,
 * for however long the actual first fetch takes. Subsequent refreshes
 * update the data silently without flashing the loader again.
 */
export function useFirstLoad(isLoading: boolean): boolean {
  const doneRef = useRef(false);

  // Once loading finishes for the first time, permanently mark as done.
  // Writing to a ref during render is intentional — refs don't cause re-renders
  // and this is a one-way latch (false → true, never resets).
  if (!isLoading && !doneRef.current) {
    doneRef.current = true;
  }

  // Show loader only if we haven't completed the first load yet
  return !doneRef.current;
}
