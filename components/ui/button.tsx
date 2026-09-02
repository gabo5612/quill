import { cva, type VariantProps } from 'class-variance-authority'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as React from 'react'

const button = cva(
  [
    'inline-flex items-center justify-center gap-2 font-medium rounded-md',
    'transition-colors duration-[150ms] ease-[cubic-bezier(0.4,0,0.2,1)]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]',
    'disabled:pointer-events-none disabled:opacity-50 select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover-bg)]',
        secondary:
          'bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-text)] border border-[var(--btn-secondary-border)] hover:bg-[var(--surface-raised)]',
        ghost:
          'bg-transparent text-[var(--btn-ghost-text)] hover:bg-[var(--btn-ghost-hover-bg)]',
        destructive:
          'bg-[var(--primitives-red-300)] text-[var(--primitives-neutrals-50)] hover:bg-[var(--primitives-red-400)] dark:bg-[var(--primitives-red-400)] dark:hover:bg-[var(--primitives-red-300)]',
      },
      size: {
        sm: 'h-7 px-3 text-small',
        md: 'h-9 px-4 text-small',
        lg: 'h-11 px-6 text-body',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size:    'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      icon,
      iconPosition = 'left',
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'

    const spinnerSize = size === 'lg' ? 18 : 15

    const leftIcon = loading ? (
      <Loader2 size={spinnerSize} className="animate-spin shrink-0" />
    ) : icon && iconPosition === 'left' ? (
      <span className="shrink-0">{icon}</span>
    ) : null

    const rightIcon =
      !loading && icon && iconPosition === 'right' ? (
        <span className="shrink-0">{icon}</span>
      ) : null

    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {leftIcon}
        <Slottable>{children}</Slottable>
        {rightIcon}
      </Comp>
    )
  }
)

Button.displayName = 'Button'
