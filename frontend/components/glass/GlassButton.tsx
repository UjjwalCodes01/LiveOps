'use client';

import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface GlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'className'> {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-status-info/25 border-status-info/50 text-white hover:bg-status-info/35 focus-visible:ring-status-info/60',
  secondary:
    'bg-white/8 border-white/20 text-white/90 hover:bg-white/14 focus-visible:ring-white/40',
  danger:
    'bg-status-error/20 border-status-error/50 text-white hover:bg-status-error/30 focus-visible:ring-status-error/60',
};

export function GlassButton({
  children,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  ...rest
}: GlassButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      whileHover={isDisabled ? undefined : { scale: 1.02 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      )}
      {children}
    </motion.button>
  );
}
