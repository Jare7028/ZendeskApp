import { Badge } from "@/components/ui/badge";
import { type CapacityStatusTone } from "@/lib/metrics/dashboard";
import { cn } from "@/lib/utils";

const toneClassName: Record<CapacityStatusTone, string> = {
  balanced: "bg-emerald-100 text-emerald-900",
  warning: "bg-amber-100 text-amber-900",
  critical: "bg-rose-100 text-rose-900",
  muted: "bg-muted text-foreground"
};

export function CapacityBadge({
  label,
  tone
}: {
  label: string;
  tone: CapacityStatusTone;
}) {
  return <Badge className={cn("whitespace-nowrap", toneClassName[tone])}>{label}</Badge>;
}
