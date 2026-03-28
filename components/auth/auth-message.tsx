import { cn } from "@/lib/utils";

export function AuthMessage({
  error,
  message
}: {
  error?: string;
  message?: string;
}) {
  if (!error && !message) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        error
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-accent-foreground/15 bg-accent/60 text-accent-foreground"
      )}
    >
      {error ?? message}
    </div>
  );
}

