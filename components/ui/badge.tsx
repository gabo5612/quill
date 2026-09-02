import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badge = cva(
  'inline-flex items-center font-medium rounded-full border',
  {
    variants: {
      status: {
        draft:     'bg-[var(--status-draft-bg)]     text-[var(--status-draft-text)]     border-transparent',
        in_review: 'bg-[var(--status-review-bg)]    text-[var(--status-review-text)]    border-transparent',
        approved:  'bg-[var(--status-published-bg)] text-[var(--status-published-text)] border-transparent',
        exported:  'bg-[color-mix(in_srgb,#3b82f6_12%,transparent)] text-[#2563eb] dark:text-[#60a5fa] border-transparent',
      },
      size: {
        sm: 'px-2 py-0.5 text-caption gap-1',
        md: 'px-2.5 py-1 text-small gap-1.5',
      },
    },
    defaultVariants: {
      status: 'draft',
      size:   'md',
    },
  }
)

export type BadgeStatus = 'draft' | 'in_review' | 'approved' | 'exported'

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {
  status?: BadgeStatus
  size?: 'sm' | 'md'
}

const STATUS_LABELS: Record<BadgeStatus, string> = {
  draft:     'Draft',
  in_review: 'In review',
  approved:  'Approved',
  exported:  'Exported',
}

export function Badge({ status = 'draft', size = 'md', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badge({ status, size }), className)}
      {...props}
    >
      {children ?? STATUS_LABELS[status]}
    </span>
  )
}
