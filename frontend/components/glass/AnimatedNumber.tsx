'use client';

import { animate, useMotionValue, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';

export function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (latest) => Math.round(latest).toString());
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.8, ease: 'easeOut' });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => rounded.on('change', (latest) => {
    if (ref.current) ref.current.textContent = latest;
  }), [rounded]);

  return <span ref={ref}>0</span>;
}
