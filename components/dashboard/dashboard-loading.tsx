function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-40 w-full rounded-[36px]" />
      <SkeletonBlock className="h-28 w-full rounded-[28px]" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <SkeletonBlock className="h-[520px] w-full rounded-[28px]" />
        <SkeletonBlock className="h-[520px] w-full rounded-[28px]" />
      </div>
    </div>
  );
}
