interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-zinc-700/30 ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 space-y-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 p-4 space-x-3">
      <Skeleton className="h-4 w-4 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}
