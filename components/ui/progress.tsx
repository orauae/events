'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ProgressProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The current progress value (0-100)
   */
  value?: number;
  /**
   * Maximum value (default 100)
   */
  max?: number;
  /**
   * Whether to show an indeterminate animation
   */
  indeterminate?: boolean;
}

/**
 * A progress bar component for displaying completion status
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indeterminate = false, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : value}
        aria-valuemin={0}
        aria-valuemax={max}
        className={cn(
          'relative h-2 w-full overflow-hidden rounded-full bg-muted',
          className
        )}
        {...props}
      >
        <div
          className={cn(
            'h-full bg-primary transition-all duration-300 ease-in-out',
            indeterminate && 'animate-progress-indeterminate'
          )}
          style={{
            width: indeterminate ? '50%' : `${percentage}%`,
          }}
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
