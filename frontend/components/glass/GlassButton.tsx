'use client';

import { Loader2 } from 'lucide-react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { useRef, useState, type MouseEvent, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface GlassButtonProps extends Omit<HTMLMotionProps<'button'>, 'className' | 'onClick'> {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
  className?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-status-info/25 border-status-info/50 text-white hover:bg-status-info/35 focus-visible:ring-status-info/60',
  secondary:
    'bg-white/8 border-white/20 text-white/90 hover:bg-white/14 focus-visible:ring-white/40',
  danger:
    'bg-status-error/20 border-status-error/50 text-white hover:bg-status-error/30 focus-visible:ring-status-error/60',
};

let rippleId = 0;

export function GlassButton({
  children,
  variant = 'primary',
  loading = false,
  disabled,
  className = '',
  onClick,
  ...rest
}: GlassButtonProps) {
  const isDisabled = disabled || loading;
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>(
    [],
  );
  const buttonRef = useRef<HTMLButtonElement>(null);

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const button = buttonRef.current;
    if (button) {
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      rippleId += 1;
      const id = rippleId;
      setRipples((current) => [
        ...current,
        { id, x: event.clientX - rect.left - size / 2, y: event.clientY - rect.top - size / 2, size },
      ]);
      window.setTimeout(() => setRipples((current) => current.filter((r) => r.id !== id)), 650);
    }
    onClick?.(event);
  }

  return (
    <motion.button
      ref={buttonRef}
      whileHover={isDisabled ? undefined : { scale: 1.02 }}
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : handleClick}
      className={`relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full border px-5 py-2.5 text-sm font-medium backdrop-blur-md transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="ripple"
          style={{ left: ripple.x, top: ripple.y, width: ripple.size, height: ripple.size }}
        />
      ))}
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </motion.button>
  );
}
