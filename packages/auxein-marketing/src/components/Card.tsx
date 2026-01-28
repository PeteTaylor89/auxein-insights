'use client';

import { motion } from 'framer-motion';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'sand' | 'accent';
  hover?: boolean;
  onClick?: () => void;
}

export function Card({
  children,
  className,
  variant = 'default',
  hover = true,
  onClick,
}: CardProps) {
  const Component = onClick ? motion.button : motion.div;
  
  const variantStyles = {
    default: 'card',
    sand: 'card-sand',
    accent: 'card-accent',
  };

  return (
    <Component
      onClick={onClick}
      className={clsx(
        variantStyles[variant],
        hover && 'cursor-pointer',
        onClick && 'text-left w-full',
        className
      )}
      whileHover={hover ? { y: -4, transition: { duration: 0.2 } } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx('p-6 pb-0', className)}>{children}</div>;
}

export function CardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={clsx('p-6', className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('p-6 pt-0 border-t border-olive/10', className)}>
      {children}
    </div>
  );
}