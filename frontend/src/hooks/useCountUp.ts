import { useEffect, useRef, useState } from 'react';

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from its previous value to `target` (ease-out). Instant with reduced motion. */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(() => (reduceMotion() ? target : 0));
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduceMotion()) { setValue(target); fromRef.current = target; return; }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * eased;
      setValue(v);
      fromRef.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
