'use client';

import { motion } from 'motion/react';
import { useRef, type PointerEvent, type ReactNode, type Ref } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  delay?: number;
  spotlight?: boolean;
  hover?: boolean;
  as?: 'div' | 'section' | 'article';
}

export function GlassPanel({
  children,
  className = '',
  strong = false,
  delay = 0,
  spotlight = true,
  hover = false,
  as = 'div',
}: GlassPanelProps) {
  const Component = motion[as];
  const ref = useRef<HTMLElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
  }

  return (
    <Component
      ref={ref as Ref<never>}
      onPointerMove={spotlight ? handlePointerMove : undefined}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hover ? { y: -3 } : undefined}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={`${strong ? 'glass-panel-strong' : 'glass-panel'} ${spotlight ? 'glass-spotlight' : ''} ${className}`}
    >
      {children}
    </Component>
  );
}
