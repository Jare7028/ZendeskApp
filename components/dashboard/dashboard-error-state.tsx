"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DashboardErrorState({
  title,
  description,
  reset
}: {
  title: string;
  description: string;
  reset: () => void;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50/80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="text-rose-900/80">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => reset()} type="button" variant="outline">
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
