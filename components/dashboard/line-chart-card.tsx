"use client";

import { useEffect, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Point = {
  date: string;
  primary: number | null;
  secondary: number | null;
};

function buildPath(values: number[], height: number, width: number, maxValue: number) {
  if (values.length === 0) {
    return "";
  }

  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildPoint(value: number, index: number, count: number, height: number, width: number, maxValue: number) {
  const x = count === 1 ? width / 2 : (index / (count - 1)) * width;
  const y = height - (value / maxValue) * height;
  return { x, y };
}

export function LineChartCard({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  primaryColor,
  secondaryColor,
  data
}: {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryColor: string;
  secondaryColor: string;
  data: Point[];
}) {
  const width = 640;
  const height = 220;
  const primaryValues = data.map((point) => point.primary ?? 0);
  const secondaryValues = data.map((point) => point.secondary ?? 0);
  const chartMax = Math.max(...primaryValues, ...secondaryValues, 1);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, data.length - 1));
  const activePoint = data[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex(Math.max(0, data.length - 1));
  }, [data.length]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No daily data landed in the selected window yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: primaryColor }} />
                {primaryLabel}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: secondaryColor }} />
                {secondaryLabel}
              </span>
            </div>
            <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height + 24}`} role="img">
              <path
                d={buildPath(primaryValues, height, width, chartMax)}
                fill="none"
                stroke={primaryColor}
                strokeLinecap="round"
                strokeWidth="4"
              />
              <path
                d={buildPath(secondaryValues, height, width, chartMax)}
                fill="none"
                stroke={secondaryColor}
                strokeDasharray="8 8"
                strokeLinecap="round"
                strokeWidth="4"
              />
              {data.map((point, index) => {
                const primaryPoint = buildPoint(point.primary ?? 0, index, data.length, height, width, chartMax);
                const secondaryPoint = buildPoint(point.secondary ?? 0, index, data.length, height, width, chartMax);
                const isActive = index === activeIndex;

                return (
                  <g key={point.date}>
                    <rect
                      x={index === 0 ? 0 : ((index - 0.5) / Math.max(data.length - 1, 1)) * width}
                      y={0}
                      width={data.length === 1 ? width : width / Math.max(data.length - 1, 1)}
                      height={height + 24}
                      fill="transparent"
                      onMouseEnter={() => setActiveIndex(index)}
                    />
                    <circle
                      cx={primaryPoint.x}
                      cy={primaryPoint.y}
                      fill={primaryColor}
                      opacity={isActive ? 1 : 0.45}
                      r={isActive ? 6 : 4}
                    />
                    <circle
                      cx={secondaryPoint.x}
                      cy={secondaryPoint.y}
                      fill={secondaryColor}
                      opacity={isActive ? 1 : 0.45}
                      r={isActive ? 6 : 4}
                    />
                  </g>
                );
              })}
            </svg>
            {activePoint ? (
              <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {new Intl.DateTimeFormat("en-GB", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC"
                  }).format(new Date(`${activePoint.date}T00:00:00.000Z`))}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{primaryLabel}</p>
                    <p className="text-xl font-semibold text-foreground">
                      {activePoint.primary !== null ? activePoint.primary.toFixed(1) : "No data"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{secondaryLabel}</p>
                    <p className="text-xl font-semibold text-foreground">
                      {activePoint.secondary !== null ? activePoint.secondary.toFixed(1) : "No data"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
              {data.slice(Math.max(0, data.length - 4)).map((point) => (
                <button
                  key={point.date}
                  className="rounded-2xl bg-muted/60 p-3 text-left transition hover:bg-muted"
                  onMouseEnter={() => setActiveIndex(data.findIndex((entry) => entry.date === point.date))}
                  type="button"
                >
                  <p>
                    {new Intl.DateTimeFormat("en-GB", {
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC"
                    }).format(new Date(`${point.date}T00:00:00.000Z`))}
                  </p>
                  <p className="mt-1 font-medium text-foreground">
                    {point.primary !== null ? point.primary.toFixed(1) : "0.0"} /{" "}
                    {point.secondary !== null ? point.secondary.toFixed(1) : "0.0"}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
