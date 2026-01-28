import { forwardRef } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  external?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-olive hover:bg-olive-600 text-white shadow-sm hover:shadow-md active:scale-[0.98]',
  secondary:
    'bg-transparent border-2 border-olive/25 text-charcoal hover:border-olive hover:text-olive',
  accent:
    'bg-terracotta hover:bg-terracotta-600 text-white shadow-sm hover:shadow-md active:scale-[0.98]',
  ghost:
    'text-charcoal hover:text-olive hover:bg-olive-50',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      href,
      external,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive disabled:opacity-50 disabled:cursor-not-allowed';

    const combinedStyles = clsx(
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      className
    );

    if (href) {
      if (external) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={combinedStyles}
          >
            {children}
          </a>
        );
      }
      return (
        <Link href={href} className={combinedStyles}>
          {children}
        </Link>
      );
    }

    return (
      <button ref={ref} className={combinedStyles} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';