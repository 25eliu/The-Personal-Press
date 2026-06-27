/**
 * A requestAnimationFrame tween shared by the live-edit choreography and the initial-
 * generation reveal. Eases `from`→`to` over `ms`, calling `onStep` each frame and
 * resolving when done; bails immediately if `cancelled()` turns true (a newer run took
 * over). Kept framework-free so both consumers use identical timing.
 */
export function tween(
  from: number,
  to: number,
  ms: number,
  ease: (t: number) => number,
  onStep: (v: number) => void,
  cancelled: () => boolean,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now: number) => {
      if (cancelled()) return resolve();
      const t = Math.min(1, (now - start) / ms);
      onStep(from + (to - from) * ease(t));
      if (t >= 1) return resolve();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

export const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
export const linear = (t: number) => t;
