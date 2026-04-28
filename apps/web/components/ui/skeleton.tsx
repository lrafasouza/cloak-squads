import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import { forwardRef } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  count?: number;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ className, count = 1, ...props }, ref) => (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          ref={i === 0 ? ref : undefined}
          className={cn("animate-pulse rounded-md bg-neutral-800", className)}
          {...props}
        />
      ))}
    </>
  )
);
Skeleton.displayName = "Skeleton";

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 space-y-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

interface SpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

export const Spinner = forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = "md", ...props }, ref) => {
    const sizes = {
      sm: "h-4 w-4",
      md: "h-6 w-6",
      lg: "h-8 w-8",
    };

    return (
      <div
        ref={ref}
        className={cn("inline-flex items-center justify-center", className)}
        {...props}
      >
        <svg
          className={cn("animate-spin text-emerald-400", sizes[size])}
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }
);
Spinner.displayName = "Spinner";
