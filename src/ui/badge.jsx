import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border-[#3d537a] bg-[#1d2b43] text-[#afc8f5]',
        muted: 'border-[#2a3345] bg-[#0e1520] text-[#a8b3c7]',
        success: 'border-[#1f4e3e] bg-[#1b3a30] text-[#9ae7c2]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
