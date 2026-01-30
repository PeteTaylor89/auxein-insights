import { forwardRef, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, required, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-charcoal mb-2">
            {label}
            {required && <span className="text-terracotta ml-1">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-charcoal',
            'placeholder:text-charcoal-400',
            'focus:outline-none focus:ring-2 focus:ring-olive/20 focus:border-olive',
            'transition-colors duration-200',
            'resize-y min-h-[120px]',
            error
              ? 'border-terracotta focus:ring-terracotta/20 focus:border-terracotta'
              : 'border-charcoal/20',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-terracotta">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';