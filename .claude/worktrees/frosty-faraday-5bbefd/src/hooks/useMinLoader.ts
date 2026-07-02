import { useState, useEffect, useRef } from "react";

/**
 * Returns `true` while `isLoading` is true, and stays `true` for at least
 * `minMs` milliseconds after loading starts — so the WaterFillLoader always
 * completes at least one full animation cycle before it disappears.
 *
 * @param isLoading  The real loading flag from your data-fetch hook/state
 * @param minMs      Minimum visible time in ms (default 3200 = one full fill cycle)
 */
export function useMinLoader(isLoading: boolean, minMs = 3200): boolean {
  const [visible, setVisible] = useState(isLoading);
  const startRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Loading started / restarted — reset clock and ensure visible
      if (timerRef.current) clearTimeout(timerRef.current);
      startRef.current = Date.now();
      setVisible(true);
    } else {
      // Loading finished — wait for remainder of the current fill cycle
      const elapsed = Date.now() - startRef.current;
      const delay = Math.max(0, minMs - elapsed);
      timerRef.current = setTimeout(() => setVisible(false), delay);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLoading, minMs]);

  return visible;
}
