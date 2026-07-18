'use client';

import { motion } from 'motion/react';
import type { ReactNode } from 'react';

interface GlassPanelProps {
  children: ReactNode;
  className?: string;
  strong?: boolean;
  delay?: number;
  as?: 'div' | 'section' | 'article';
}

export function GlassPanel({
  children,
  className = '',
  strong = false,
  delay = 0,
  as = 'div',
}: GlassPanelProps) {
  const Component = motion[as];
  return (
    <Component
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      className={`${strong ? 'glass-panel-strong' : 'glass-panel'} ${className}`}
    >
      {children}
    </Component>
  );
}
