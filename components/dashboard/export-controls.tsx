import { cn } from "@/lib/utils";

function ExportLink({
  href,
  label,
  className
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-2xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted",
        className
      )}
      href={href}
    >
      {label}
    </a>
  );
}

export function ExportControls({
  csvHref,
  pdfHref,
  className
}: {
  csvHref: string;
  pdfHref: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      <ExportLink href={csvHref} label="Export CSV" />
      <ExportLink href={pdfHref} label="Export PDF" />
    </div>
  );
}
