import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ChannelPoint = {
  date: string;
  email: number;
  chat: number;
  phone: number;
  other: number;
};

const CHANNELS = [
  { key: "email", label: "Email", color: "#0f766e" },
  { key: "chat", label: "Chat", color: "#d97706" },
  { key: "phone", label: "Phone", color: "#0f4c81" },
  { key: "other", label: "Other", color: "#7c6f64" }
] as const;

export function ChannelStackedCard({
  title,
  description,
  data
}: {
  title: string;
  description: string;
  data: ChannelPoint[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Channel rollups will appear after synced ticket data lands.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {CHANNELS.map((channel) => (
                <span key={channel.key} className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: channel.color }} />
                  {channel.label}
                </span>
              ))}
            </div>
            <div className="space-y-3">
              {data.map((point) => {
                const total = point.email + point.chat + point.phone + point.other;

                return (
                  <div key={point.date} className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {new Intl.DateTimeFormat("en-GB", {
                          month: "short",
                          day: "numeric",
                          timeZone: "UTC"
                        }).format(new Date(`${point.date}T00:00:00.000Z`))}
                      </span>
                      <span>{total.toFixed(0)} interactions</span>
                    </div>
                    <div className="flex h-4 overflow-hidden rounded-full bg-muted">
                      {CHANNELS.map((channel) => {
                        const value = point[channel.key];
                        const width = total > 0 ? (value / total) * 100 : 0;

                        return (
                          <div
                            key={channel.key}
                            style={{ width: `${width}%`, backgroundColor: channel.color }}
                            title={`${channel.label}: ${value.toFixed(0)}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
