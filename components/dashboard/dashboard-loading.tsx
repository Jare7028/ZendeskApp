function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-36 w-full" />
        <SkeletonBlock className="h-36 w-full" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SkeletonBlock className="h-60 w-full" />
        <SkeletonBlock className="h-60 w-full" />
      </div>
      <SkeletonBlock className="h-72 w-full" />
    </div>
  );
}
